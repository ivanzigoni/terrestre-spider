import type { CheerioAPI } from 'cheerio';
import { createCheerioRouter, type Dataset } from 'crawlee';

import { FormatoCaptura } from '../../persistence/enums/formato-captura.enum.js';
import type { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoPaginaCaptura } from '../../persistence/enums/tipo-pagina-captura.enum.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import {
  parseSitemapUrls,
  type SitemapUrlEntry,
} from '../shared/sitemap-client.js';

/**
 * GSA Ativos (`discovery/independentes-diagnostico.md`, lote 5 de
 * `.claude/__workdir/integracao-lote/lotes.md`) — WordPress puro (JetEngine/Elementor),
 * sitemap nativo do WordPress (não Yoast) sob `/imoveis/` (plural — diferente do
 * `/imovel/` usado por Loft Sites/ImobiBrasil, ver `sitemap-client.ts`). Diferente
 * daqueles dois clusters, a página de detalhe é 100% renderizada no servidor —
 * confirmado no diagnóstico ao vivo (preço e finalidade presentes no HTML cru) — então
 * não precisa de `PlaywrightCrawler`, `CheerioCrawler` já basta nas duas fases.
 *
 * `tipoTransacao` fica `null`: o slug não indica venda/aluguel (nomes de
 * empreendimento/unidade, ex. `business-tower-sala-403`), e a página de detalhe mistura
 * o preço do próprio imóvel com o de imóveis "similares" no mesmo bloco de texto — sem
 * seletor confiável pra distinguir sem investigação mais funda, que não se paga dado que
 * a pipeline atual só grava captura bruta mesmo.
 */

const PATH_PREFIX = '/imoveis/';

/**
 * O `$` que o `CheerioCrawler` do `crawlee` entrega no handler vem da cópia de `cheerio`
 * pinada internamente pelo pacote, estruturalmente divergente da versão direta deste
 * projeto — mesmo caso documentado em `loft-sites-router.ts`/`imobibrasil-router.ts`.
 */
function comoCheerioDoProjeto(dollar: unknown): CheerioAPI {
  return dollar as CheerioAPI;
}

export function createGsaAtivosDescobertaRouter(coletados: SitemapUrlEntry[]) {
  const router = createCheerioRouter();

  router.addDefaultHandler(({ $, request, log }) => {
    const entradas = parseSitemapUrls(comoCheerioDoProjeto($), PATH_PREFIX);
    coletados.push(...entradas);
    log.info(
      `descoberta: ${String(entradas.length)} URL(s) de imóvel em ${request.loadedUrl}`,
    );
  });

  return router;
}

export function createGsaAtivosDetalheRouter(
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
      conteudo: comoCheerioDoProjeto($).html(),
      capturadoEm: new Date().toISOString(),
    });
    log.info(`${origem}: detalhe capturado em ${url}`);
  });

  return router;
}
