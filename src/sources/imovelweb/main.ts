import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import * as Sentry from '@sentry/node';
import { log, PlaywrightCrawler } from 'crawlee';

import { loadStartUrls } from '../../config/search-urls.js';
import { createDataSource } from '../../persistence/data-source.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import type { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import {
  inserirCapturasBrutas,
  uploadCapturasBrutas,
} from '../../persistence/load-raw-captures.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import { Mutex } from '../../persistence/upload-mutex.js';
import { backoffOnRateLimit } from '../shared/backoff.js';
import {
  type CrawlStats,
  type ExecucaoStats,
  sumCrawlStats,
} from '../shared/crawl-stats.js';
import {
  getMaxListingPagesPerCrawl,
  SAME_DOMAIN_DELAY_SECS,
} from '../shared/crawler-defaults.js';
import { reportFailedRequest } from '../shared/report-failed-request.js';
import { runWithWatchdog } from '../shared/run-with-watchdog.js';
import { openFreshDataset, openFreshRequestQueue } from '../shared/storage.js';
import {
  createImovelwebDetalheRouter,
  createImovelwebRouter,
} from './routes.js';

export async function runImovelweb(
  uploadMutex: Mutex = new Mutex(),
): Promise<ExecucaoStats> {
  const maxListingPages = getMaxListingPagesPerCrawl(OrigemAnuncio.IMOVELWEB);
  const entries = await loadStartUrls(OrigemAnuncio.IMOVELWEB);
  const dataset = await openFreshDataset(OrigemAnuncio.IMOVELWEB);
  const capturaDataset = await openFreshDataset<RawCaptureItem>(
    `${OrigemAnuncio.IMOVELWEB}-raw`,
  );

  // Um crawler por URL de busca (aluguel, venda) — o teto de páginas
  // (maxRequestsPerCrawl) vale por URL, não somado entre elas.
  const stats: CrawlStats[] = [];
  for (const entry of entries) {
    const requestQueue = await openFreshRequestQueue(
      `${OrigemAnuncio.IMOVELWEB}-${entry.tipoTransacao}`,
    );
    const crawler = new PlaywrightCrawler({
      httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
      requestHandler: createImovelwebRouter(dataset, capturaDataset),
      requestQueue,
      headless: true,
      // Ver imoview-browser-main.ts: sem isso o AutoscaledPool escala sozinho até
      // 200, e cada tarefa aqui é uma página headless inteira renderizando JS — além
      // disso, 1 de cada vez fica mais perto do padrão humano que o desafio
      // Cloudflare comentado abaixo já está tolerando.
      maxConcurrency: 1,
      sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
      maxRequestsPerCrawl: maxListingPages,
      // O SessionPool do Crawlee (`_throwOnBlockedRequest`, em basic-crawler.js) aposenta a
      // sessão e lança erro de imediato em qualquer resposta 401/403/429, ANTES até da
      // heurística própria do Crawlee pra desafio Cloudflare (que espera 5s e reavalia)
      // rodar. Diagnosticado ao vivo: sem este ajuste, um 403 vindo do desafio Cloudflare
      // sempre aposentava a sessão inteira (perdendo o cookie __cf_bm já conquistado) e
      // reiniciava do zero — o pior caminho contra um mecanismo de scoring comportamental,
      // que penaliza sessão nova mais que sessão contínua. Tiramos só 403 dessa lista —
      // 401/429 continuam aposentando a sessão normalmente.
      //
      // Isso reduz o dano, mas não elimina o desafio: em execuções de teste, o ponto em
      // que a Cloudflare passou a exigir o desafio variou entre a 2ª e a 5ª página, e em
      // modo headless (o modo de produção) o desafio às vezes não passou sozinho dentro de
      // 30s, mesmo continuando na mesma sessão. Quando isso acontece, o waitForSelector do
      // router (routes.ts) só encontra 0 cards e nenhum link de próxima página — o handler
      // não lança erro, só para de enfileirar novas páginas ali, sem travar a fonte
      // inteira. Ou seja: a seed captura o que conseguir antes da barreira aparecer, sem
      // garantia de alcançar o teto de página 5 já imposto pelo robots.txt (routes.ts) —
      // e, de qualquer forma, não há, e não deve haver, nenhuma tentativa de resolver o
      // desafio interativamente.
      //
      // Também isola o Key-Value Store de sessão por origem: sem isso, o SessionPool
      // se autopersiste no store DEFAULT do processo com uma chave fixa — sob
      // SPIDER_BATCH_SIZE > 1, duas fontes escrevendo ali ao mesmo tempo (o evento
      // persistState do Crawlee dispara pra todas juntas, a cada 60s) corrompeu esse
      // arquivo em runs reais (JSON5: invalid end of input). Mesmo risco existiria
      // com `context.useState()` — não usar sem configurar um KVS próprio.
      sessionPoolOptions: {
        blockedStatusCodes: [401, 429],
        persistStateKeyValueStoreId: `${OrigemAnuncio.IMOVELWEB}-sessions`,
      },
      errorHandler: (context) => backoffOnRateLimit(context),
      failedRequestHandler: (context, error) => {
        reportFailedRequest(OrigemAnuncio.IMOVELWEB, context, error);
      },
    });
    stats.push(
      await runWithWatchdog(
        `Imovelweb ${entry.tipoTransacao}`,
        crawler.run([
          {
            url: entry.url,
            userData: { tipoTransacao: entry.tipoTransacao },
          },
        ]),
        maxListingPages,
      ),
    );
  }

  // Fase de detalhe: visita cada link único descoberto na listagem — sem teto próprio
  // (o volume já é limitado indiretamente por MAX_LISTING_PAGES_PER_CRAWL). Um link
  // pode aparecer nas duas transações raramente; fica com a primeira tipoTransacao
  // vista, não é crítico pra captura bruta.
  const linksUnicos = new Map<string, TipoTransacao>();
  await dataset.forEach((item) => {
    if (!linksUnicos.has(item.link)) {
      linksUnicos.set(item.link, item.tipoTransacao);
    }
  });
  const linksEncontrados = (await dataset.getInfo())?.itemCount ?? 0;

  if (linksUnicos.size > 0) {
    const detalheQueue = await openFreshRequestQueue(
      `${OrigemAnuncio.IMOVELWEB}-detalhe`,
    );
    await detalheQueue.addRequests(
      [...linksUnicos].map(([url, tipoTransacao]) => ({
        url,
        userData: { tipoTransacao },
      })),
    );
    const detalheCrawler = new PlaywrightCrawler({
      httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
      requestHandler: createImovelwebDetalheRouter(capturaDataset),
      requestQueue: detalheQueue,
      headless: true,
      maxConcurrency: 1,
      sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
      // Mesmo ajuste do crawler de listagem acima (ver comentário lá) — evita que um
      // 403 do desafio Cloudflare aposente a sessão inteira, e usa o mesmo Key-Value
      // Store de sessão (nunca rodam ao mesmo tempo dentro desta fonte).
      sessionPoolOptions: {
        blockedStatusCodes: [401, 429],
        persistStateKeyValueStoreId: `${OrigemAnuncio.IMOVELWEB}-sessions`,
      },
      errorHandler: (context) => backoffOnRateLimit(context),
      failedRequestHandler: (context, error) => {
        reportFailedRequest(OrigemAnuncio.IMOVELWEB, context, error);
      },
    });
    stats.push(
      await runWithWatchdog(
        'Imovelweb detalhe',
        detalheCrawler.run(),
        linksUnicos.size,
      ),
    );
  }

  // Dentro do mutex: duas fontes chamando uploadCapturasBrutas ao mesmo
  // tempo corrompeu o armazenamento local do Crawlee numa run real (ver
  // upload-mutex.ts).
  let capturasBrutasEnviadas = 0;
  try {
    await uploadMutex.runExclusive(async () => {
      const capturas = await uploadCapturasBrutas(capturaDataset);
      const dataSource = createDataSource();
      await dataSource.initialize();
      try {
        await inserirCapturasBrutas(capturas, dataSource);
      } finally {
        await dataSource.destroy();
      }
      capturasBrutasEnviadas = capturas.length;
      log.info(
        `Imovelweb: ${String(capturas.length)} captura(s) bruta(s) enviada(s) ao bucket e registrada(s) em capturas_brutas`,
      );
    });
  } catch (error) {
    log.warning(
      'Imovelweb: captura bruta falhou, run principal não é afetada',
      {
        error,
      },
    );
    Sentry.captureException(error, {
      tags: { fonte: OrigemAnuncio.IMOVELWEB, fase: 'captura-bruta' },
    });
  }

  return {
    ...sumCrawlStats(stats),
    linksEncontrados,
    linksUnicosDetalhe: linksUnicos.size,
    capturasBrutasEnviadas,
  };
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runImovelweb();
}
