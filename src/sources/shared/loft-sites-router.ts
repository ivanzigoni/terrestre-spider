import type { CheerioAPI } from 'cheerio';
import { createCheerioRouter, type Dataset } from 'crawlee';

import { FormatoCaptura } from '../../persistence/enums/formato-captura.enum.js';
import type { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoPaginaCaptura } from '../../persistence/enums/tipo-pagina-captura.enum.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import {
  parseSitemapIndex,
  parseSitemapUrls,
  type SitemapUrlEntry,
} from './loft-sites-client.js';

/**
 * Routers do cluster GTM Capital/Loft Sites — dois papéis bem separados, diferente do
 * padrão de dois estágios do Kenlo/Imoview (lá a fase 1 já extrai o link do item via
 * API; aqui o sitemap não carrega dado de negócio, só links).
 *
 * Fase de descoberta (`createLoftSitesDescobertaRouter`): `/sitemap.xml` (label
 * `SITEMAP_INDEX`) → cada `/sitemaps/imoveis-N.xml` (label `SITEMAP_FILE`) → acumula
 * `{ url, lastmod }` em `coletados` por closure. Sem Dataset/capturaDataset próprios —
 * o sitemap não tem dado de negócio pra justificar gravar captura bruta dele (o único
 * `FormatoCaptura` que se aplicaria seria XML, que não existe no enum hoje; estender o
 * enum só pra isso não se paga, ver decisão registrada no plano do lote 3).
 *
 * Fase de detalhe (`createLoftSitesDetalheRouter`): único request handler, só grava a
 * captura bruta da página — sem tentativa de extração estruturada (a pipeline não
 * estrutura mais dado de anúncio, ver refactor que remove `RawListingItem`).
 * `tipoTransacao` é sempre `null`: o sitemap não distingue venda/aluguel, e nenhuma
 * extração de conteúdo é feita aqui pra descobrir.
 */

/**
 * O `$` que o `CheerioCrawler` do `crawlee` entrega no handler vem da cópia de `cheerio`
 * pinada internamente pelo pacote (`1.0.0-rc.12`, nested em `node_modules/@crawlee/*`),
 * estruturalmente divergente da versão direta deste projeto (`cheerio` ^1.2.0 — usada
 * pelo `loft-sites-client.ts` e por `load()` nos testes, e mais nova o bastante pra ter
 * ganho métodos como `extract` que a rc.12 não tem). É o mesmo objeto em runtime — a
 * cast é só pra alinhar o tipo estático com a assinatura do client, único ponto do
 * código onde as duas versões se encontram.
 */
function comoCheerioDoProjeto(dollar: unknown): CheerioAPI {
  return dollar as CheerioAPI;
}

export function createLoftSitesDescobertaRouter(coletados: SitemapUrlEntry[]) {
  const router = createCheerioRouter();

  router.addHandler('SITEMAP_INDEX', async ({ $, addRequests, log }) => {
    const arquivos = parseSitemapIndex(comoCheerioDoProjeto($));
    log.info(`descoberta: ${String(arquivos.length)} arquivo(s) de sitemap`);
    if (arquivos.length > 0) {
      await addRequests(
        arquivos.map((url) => ({ url, label: 'SITEMAP_FILE' })),
      );
    }
  });

  router.addHandler('SITEMAP_FILE', ({ $, request, log }) => {
    const entradas = parseSitemapUrls(comoCheerioDoProjeto($));
    coletados.push(...entradas);
    log.info(
      `descoberta: ${String(entradas.length)} URL(s) de imóvel em ${request.loadedUrl}`,
    );
  });

  return router;
}

export function createLoftSitesDetalheRouter(
  capturaDataset: Dataset<RawCaptureItem>,
  origem: OrigemAnuncio,
) {
  const router = createCheerioRouter();

  router.addDefaultHandler(async ({ $, request, log }) => {
    const url = request.loadedUrl;

    await capturaDataset.pushData({
      origem,
      tipoTransacao: null,
      tipoPagina: TipoPaginaCaptura.DETALHE,
      url,
      formato: FormatoCaptura.HTML,
      conteudo: $.html(),
      capturadoEm: new Date().toISOString(),
    });
    log.info(`${origem}: detalhe capturado em ${url}`);
  });

  return router;
}
