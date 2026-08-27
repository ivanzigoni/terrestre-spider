import type { CheerioAPI } from 'cheerio';
import {
  createCheerioRouter,
  createPlaywrightRouter,
  type Dataset,
} from 'crawlee';

import { FormatoCaptura } from '../../persistence/enums/formato-captura.enum.js';
import type { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoPaginaCaptura } from '../../persistence/enums/tipo-pagina-captura.enum.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import {
  isDetalheImovelUrl,
  parseTipoTransacaoFromSlug,
} from './imobibrasil-client.js';
import {
  parseSitemapIndex,
  parseSitemapUrls,
  type SitemapUrlEntry,
} from './sitemap-client.js';

/**
 * Routers do cluster ImobiBrasil — descoberta via sitemap igual ao Loft Sites
 * (`loft-sites-router.ts`), mas num único handler: os dois sites confirmados neste
 * cluster expõem `/sitemap.xml` como `<urlset>` direto (sem `<sitemapindex>`
 * intermediário), diferente dos 8 sites do Loft Sites. O handler tenta
 * `parseSitemapIndex` primeiro e só recorre a sub-sitemaps se vier algo — cobre os dois
 * formatos sem precisar de dois labels fixos.
 *
 * Fase de detalhe: mesmo padrão do `imoview-browser-router.ts`
 * (`createImoviewBrowserDetalheRouter`) — navega com `PlaywrightCrawler` e captura
 * `page.content()` pós-render, sem interceptar nenhuma chamada de rede (confirmado no
 * diagnóstico ao vivo do lote 4: o conteúdo real só existe depois do JS da página
 * rodar, e não há XHR interceptável). Diferença: `tipoTransacao` vem do slug da própria
 * URL (`parseTipoTransacaoFromSlug`), não do `userData` da request.
 */

/**
 * O `$` que o `CheerioCrawler` do `crawlee` entrega no handler vem da cópia de `cheerio`
 * pinada internamente pelo pacote, estruturalmente divergente da versão direta deste
 * projeto — mesmo caso documentado em `loft-sites-router.ts`, único ponto do código onde
 * as duas versões se encontram.
 */
function comoCheerioDoProjeto(dollar: unknown): CheerioAPI {
  return dollar as CheerioAPI;
}

export function createImobiBrasilDescobertaRouter(
  coletados: SitemapUrlEntry[],
) {
  const router = createCheerioRouter();

  router.addHandler(
    'SITEMAP_ENTRY',
    async ({ $, request, addRequests, log }) => {
      const subSitemaps = parseSitemapIndex(comoCheerioDoProjeto($));
      if (subSitemaps.length > 0) {
        log.info(`descoberta: ${String(subSitemaps.length)} sub-sitemap(s)`);
        await addRequests(
          subSitemaps.map((url) => ({ url, label: 'SITEMAP_ENTRY' })),
        );
        return;
      }

      const entradas = parseSitemapUrls(comoCheerioDoProjeto($)).filter(
        (entrada) => isDetalheImovelUrl(entrada.url),
      );
      coletados.push(...entradas);
      log.info(
        `descoberta: ${String(entradas.length)} URL(s) de imóvel em ${request.loadedUrl}`,
      );
    },
  );

  return router;
}

export function createImobiBrasilDetalheRouter(
  capturaDataset: Dataset<RawCaptureItem>,
  origem: OrigemAnuncio,
) {
  const router = createPlaywrightRouter();

  router.addDefaultHandler(async ({ page, log }) => {
    const url = page.url();
    const tipoTransacao = parseTipoTransacaoFromSlug(url);

    await capturaDataset.pushData({
      origem,
      tipoTransacao,
      tipoPagina: TipoPaginaCaptura.DETALHE,
      url,
      formato: FormatoCaptura.HTML,
      conteudo: await page.content(),
      capturadoEm: new Date().toISOString(),
    });
    log.info(`${origem}: detalhe capturado em ${url}`);
  });

  return router;
}
