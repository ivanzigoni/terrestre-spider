import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import * as Sentry from '@sentry/node';
import { log, PlaywrightCrawler } from 'crawlee';
import type { Page } from 'playwright';

import { createDataSource } from '../../persistence/data-source.js';
import type { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import {
  inserirCapturasBrutas,
  uploadCapturasBrutas,
} from '../../persistence/load-raw-captures.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import { Mutex } from '../../persistence/upload-mutex.js';
import { backoffOnRateLimit } from './backoff.js';
import {
  type CrawlStats,
  type ExecucaoStats,
  sumCrawlStats,
} from './crawl-stats.js';
import {
  getMaxListingPagesPerCrawl,
  SAME_DOMAIN_DELAY_SECS,
} from './crawler-defaults.js';
import { resolveCidadeCode } from './imoview-client.js';
import {
  buildListingPageUrl,
  createImoviewBrowserDetalheRouter,
  createImoviewBrowserRouter,
  waitForNativeSearchResponse,
} from './imoview-browser-router.js';
import { reportFailedRequest } from './report-failed-request.js';
import { runWithWatchdog } from './run-with-watchdog.js';
import { openFreshDataset, openFreshRequestQueue } from './storage.js';

/**
 * Variante de `imoview-main.ts` para imobiliárias do cluster Imoview cujo
 * `/retornar-imoveis-disponiveis` rejeita chamada de cliente HTTP — confirmado no
 * Liderar (`discovery/imoview-diagnostico.md`): nem `ImpitHttpClient` (fingerprint TLS
 * imitado), nem uma chamada manual via `page.evaluate` com os headers exatos que a
 * própria página usa passam. A única chamada que funciona é a que a página dispara
 * nativamente ao carregar `?pagina=N` na URL — este módulo navega para essa URL e
 * captura a resposta nativa (`imoview-browser-router.ts`), sem chamar o endpoint
 * diretamente.
 *
 * Mais lento que a variante HTTP (uma navegação de página real por página de
 * resultado, não só um POST), então só vale usar para os sites do cluster que
 * comprovadamente precisam — a maioria continua na variante rápida
 * (`imoview-main.ts`).
 */
export function createImoviewBrowserRun(
  baseUrl: string,
  origem: OrigemAnuncio,
  nomeExibicao: string,
  cidadeSlugAmigavel = 'belo-horizonte',
): (uploadMutex?: Mutex) => Promise<ExecucaoStats> {
  return async function run(
    uploadMutex: Mutex = new Mutex(),
  ): Promise<ExecucaoStats> {
    // resolveCidadeCode funciona via fetch direto mesmo neste site — a proteção
    // observada está só no endpoint de busca propriamente dito (confirmado no
    // diagnóstico).
    const maxListingPages = getMaxListingPagesPerCrawl(origem);
    const cidade = await resolveCidadeCode(baseUrl, cidadeSlugAmigavel);
    const dataset = await openFreshDataset(origem);
    const capturaDataset = await openFreshDataset<RawCaptureItem>(
      `${origem}-raw`,
    );

    // `preNavigationHooks` roda antes do `page.goto` do Crawlee — precisa registrar o
    // listener de resposta antes da navegação, senão a chamada nativa (disparada assim
    // que a página carrega) já teria acontecido antes do listener existir.
    const pendingResponses = new WeakMap<Page, Promise<string>>();

    const stats: CrawlStats[] = [];
    for (const tipoTransacao of Object.values(TipoTransacao)) {
      const requestQueue = await openFreshRequestQueue(
        `${origem}-${tipoTransacao}`,
      );
      const crawler = new PlaywrightCrawler({
        httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
        requestQueue,
        headless: true,
        // Sem isso, o AutoscaledPool escala sozinho até 200 (default) se a máquina
        // parecer ter folga — cada tarefa concorrente aqui é uma página headless
        // inteira renderizando JS, o custo real de RAM (não o processo do browser em
        // si). 1 de cada vez, mesma disciplina do sameDomainDelaySecs abaixo.
        maxConcurrency: 1,
        sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
        maxRequestsPerCrawl: maxListingPages,
        // Sem isso, o SessionPool desta fonte se autopersiste no Key-Value Store
        // DEFAULT do processo, com a mesma chave usada por qualquer outro crawler —
        // sob SPIDER_BATCH_SIZE > 1, duas fontes escrevendo ali ao mesmo tempo (o
        // evento persistState do Crawlee dispara pra todas juntas, a cada 60s)
        // corrompeu esse arquivo em runs reais (JSON5: invalid end of input). Um
        // Key-Value Store nomeado por origem isola cada fonte completamente. Mesmo
        // risco existiria com `context.useState()` — não usar sem configurar um KVS
        // próprio pelo mesmo motivo.
        sessionPoolOptions: {
          persistStateKeyValueStoreId: `${origem}-sessions`,
        },
        preNavigationHooks: [
          ({ page }) => {
            const pending = waitForNativeSearchResponse(page);
            // Marca como "tratada" desde já: se a navegação falhar antes do
            // requestHandler rodar (retry, timeout de rede), ninguém mais chega a
            // await'ar esta promise — sem isso, a rejeição do timeout vira unhandled
            // rejection e derruba o processo inteiro, não só esta request.
            pending.catch(() => undefined);
            pendingResponses.set(page, pending);
          },
        ],
        requestHandler: createImoviewBrowserRouter(
          dataset,
          capturaDataset,
          baseUrl,
          origem,
          cidadeSlugAmigavel,
          pendingResponses,
        ),
        errorHandler: (context) => backoffOnRateLimit(context),
        failedRequestHandler: (context, error) => {
          reportFailedRequest(origem, context, error);
        },
      });

      const startUrl = buildListingPageUrl(
        baseUrl,
        cidadeSlugAmigavel,
        tipoTransacao,
        1,
      );
      stats.push(
        await runWithWatchdog(
          `${nomeExibicao} ${tipoTransacao} (via navegador)`,
          crawler.run([
            {
              url: startUrl,
              userData: { tipoTransacao, cidade, numeroPagina: 1 },
            },
          ]),
          maxListingPages,
        ),
      );
    }

    // Fase de detalhe: visita cada link único descoberto na listagem — sem teto
    // próprio (o volume já é limitado indiretamente por
    // MAX_LISTING_PAGES_PER_CRAWL). Um link pode aparecer nas duas transações
    // raramente; fica com a primeira tipoTransacao vista, não é crítico pra
    // captura bruta. Diferente do crawler de listagem acima, não precisa de
    // `preNavigationHooks`/interceptação de resposta nativa — a página de
    // detalhe é carregada e capturada normalmente.
    const linksUnicos = new Map<string, TipoTransacao>();
    await dataset.forEach((item) => {
      if (!linksUnicos.has(item.link)) {
        linksUnicos.set(item.link, item.tipoTransacao);
      }
    });
    const linksEncontrados = (await dataset.getInfo())?.itemCount ?? 0;

    if (linksUnicos.size > 0) {
      const detalheQueue = await openFreshRequestQueue(`${origem}-detalhe`);
      await detalheQueue.addRequests(
        [...linksUnicos].map(([url, tipoTransacao]) => ({
          url,
          userData: { tipoTransacao },
        })),
      );
      const detalheCrawler = new PlaywrightCrawler({
        httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
        requestHandler: createImoviewBrowserDetalheRouter(
          capturaDataset,
          origem,
        ),
        requestQueue: detalheQueue,
        headless: true,
        maxConcurrency: 1,
        sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
        // Mesmo id do crawler de listagem acima — nunca rodam ao mesmo tempo dentro
        // desta fonte (sequencial), só entre fontes diferentes é que precisa isolar.
        sessionPoolOptions: {
          persistStateKeyValueStoreId: `${origem}-sessions`,
        },
        errorHandler: (context) => backoffOnRateLimit(context),
        failedRequestHandler: (context, error) => {
          reportFailedRequest(origem, context, error);
        },
      });
      stats.push(
        await runWithWatchdog(
          `${nomeExibicao} detalhe`,
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
          `${nomeExibicao}: ${String(capturas.length)} captura(s) bruta(s) enviada(s) ao bucket e registrada(s) em capturas_brutas`,
        );
      });
    } catch (error) {
      log.warning(
        `${nomeExibicao}: captura bruta falhou, run principal não é afetada`,
        { error },
      );
      Sentry.captureException(error, {
        tags: { fonte: origem, fase: 'captura-bruta' },
      });
    }

    return {
      ...sumCrawlStats(stats),
      linksEncontrados,
      linksUnicosDetalhe: linksUnicos.size,
      capturasBrutasEnviadas,
    };
  };
}
