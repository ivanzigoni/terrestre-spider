import type { CheerioAPI } from 'cheerio';
import {
  createCheerioRouter,
  createPlaywrightRouter,
  type Dataset,
} from 'crawlee';

import { FormatoCaptura } from '../../persistence/enums/formato-captura.enum.js';
import type { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoPaginaCaptura } from '../../persistence/enums/tipo-pagina-captura.enum.js';
import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import {
  parseSitemapUrls,
  type SitemapUrlEntry,
} from '../shared/sitemap-client.js';

/**
 * Imobiliária Pampulha (`discovery/independentes-diagnostico.md`, lote 5 de
 * `.claude/__workdir/integracao-lote/lotes.md`) — WordPress + Yoast SEO, sitemap
 * dedicado ao custom post type "imovel" (`imovel-sitemap.xml`, listado no
 * `sitemap_index.xml`), mesmo formato genérico do Loft Sites/ImobiBrasil.
 *
 * Igual ao ImobiBrasil (lote 4), a página de detalhe só entrega conteúdo real (preço,
 * IPTU, condomínio) depois do JS rodar — confirmado no diagnóstico ao vivo via
 * Playwright — então a fase de detalhe usa `PlaywrightCrawler`, não `CheerioCrawler`.
 *
 * Diferente do ImobiBrasil, o slug não tem um token isolado de transação — é uma frase
 * inteira gerada pelo WordPress a partir do título do anúncio (ex.:
 * "casa-a-venda-com-70m²-2-quartos-e-sem-vaga-caicara",
 * "apartamento-com-2-quartos-para-alugar-60m²-eymard"). `parseTipoTransacaoFromSlug`
 * procura os dois padrões observados ("a-venda"/"para-venda" e "para-alugar") — um
 * imóvel sem nenhum dos dois no slug (achado real: um item do sitemap não tem marcador
 * de transação) fica `null`, mesmo sentinela do Loft Sites.
 */

const PATH_PREFIX = '/imovel/';

function comoCheerioDoProjeto(dollar: unknown): CheerioAPI {
  return dollar as CheerioAPI;
}

export function parseTipoTransacaoFromSlug(url: string): TipoTransacao | null {
  const path = new URL(url).pathname;
  if (path.includes('para-alugar')) {
    return TipoTransacao.ALUGUEL;
  }
  if (path.includes('a-venda') || path.includes('para-venda')) {
    return TipoTransacao.VENDA;
  }
  return null;
}

export function createImobiliariaPampulhaDescobertaRouter(
  coletados: SitemapUrlEntry[],
) {
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

export function createImobiliariaPampulhaDetalheRouter(
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
