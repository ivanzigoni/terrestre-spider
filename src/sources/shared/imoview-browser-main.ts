import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import { PlaywrightCrawler } from 'crawlee';
import type { Page } from 'playwright';

import { AppDataSource } from '../../persistence/data-source.js';
import type { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import { loadIntoPostgres } from '../../persistence/load.js';
import { backoffOnRateLimit } from './backoff.js';
import { type CrawlStats, sumCrawlStats } from './crawl-stats.js';
import {
  MAX_REQUESTS_PER_CRAWL,
  SAME_DOMAIN_DELAY_SECS,
} from './crawler-defaults.js';
import { resolveCidadeCode } from './imoview-client.js';
import {
  buildListingPageUrl,
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
): () => Promise<CrawlStats> {
  return async function run(): Promise<CrawlStats> {
    // resolveCidadeCode funciona via fetch direto mesmo neste site — a proteção
    // observada está só no endpoint de busca propriamente dito (confirmado no
    // diagnóstico).
    const cidade = await resolveCidadeCode(baseUrl, cidadeSlugAmigavel);
    const dataset = await openFreshDataset(origem);

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
        sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
        maxRequestsPerCrawl: MAX_REQUESTS_PER_CRAWL,
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
        ),
      );
    }

    await AppDataSource.initialize();
    try {
      await loadIntoPostgres(dataset, AppDataSource);
    } finally {
      await AppDataSource.destroy();
    }

    return sumCrawlStats(stats);
  };
}
