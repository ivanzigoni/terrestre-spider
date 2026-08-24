import type { CheerioAPI } from 'cheerio';
import { createCheerioRouter, type Dataset } from 'crawlee';

import { FormatoCaptura } from '../../persistence/enums/formato-captura.enum.js';
import type { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoPaginaCaptura } from '../../persistence/enums/tipo-pagina-captura.enum.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import type { RawListingItem } from '../../persistence/raw-listing-item.js';
import {
  parseListingDetailPage,
  parseSitemapIndex,
  parseSitemapUrls,
  type SitemapUrlEntry,
} from './loft-sites-client.js';

/**
 * Routers do cluster GTM Capital/Loft Sites — dois papéis bem separados, diferente do
 * padrão de dois estágios do Kenlo/Imoview (lá a fase 1 já extrai o item completo via
 * API; aqui o sitemap não carrega dado de negócio, só links).
 *
 * Fase de descoberta (`createLoftSitesDescobertaRouter`): `/sitemap.xml` (label
 * `SITEMAP_INDEX`) → cada `/sitemaps/imoveis-N.xml` (label `SITEMAP_FILE`) → acumula
 * `{ url, lastmod }` em `coletados` por closure. Sem Dataset/capturaDataset próprios —
 * o sitemap não tem dado de negócio pra justificar gravar captura bruta dele (o único
 * `FormatoCaptura` que se aplicaria seria XML, que não existe no enum hoje; estender o
 * enum só pra isso não se paga, ver decisão registrada no plano do lote 3).
 *
 * Fase de detalhe (`createLoftSitesDetalheRouter`): único request handler, sempre grava
 * a captura bruta da página ANTES de tentar extrair (mesmo padrão de
 * `src/sources/olx/routes.ts` — mesmo com falha de parse, é o caso mais útil pra
 * diagnosticar depois), e só grava no `dataset` quando a extração teve sucesso.
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
  dataset: Dataset<RawListingItem>,
  capturaDataset: Dataset<RawCaptureItem>,
  origem: OrigemAnuncio,
) {
  const router = createCheerioRouter();

  router.addDefaultHandler(async ({ $, request, log }) => {
    const url = request.loadedUrl;
    const item = parseListingDetailPage(comoCheerioDoProjeto($), url, origem);

    // Grava a captura bruta incondicionalmente, antes/depois de tentar extrair — mesmo
    // com falha de parse, é o caso mais útil pra diagnosticar depois (mesmo raciocínio
    // do router da OLX). `tipoTransacao` só é conhecido depois do parse (achado do lote
    // 3 — a URL não indica venda/aluguel), por isso `null` explícito quando o parse
    // falha.
    await capturaDataset.pushData({
      origem,
      tipoTransacao: item?.tipoTransacao ?? null,
      tipoPagina: TipoPaginaCaptura.DETALHE,
      url,
      formato: FormatoCaptura.HTML,
      conteudo: $.html(),
      capturadoEm: new Date().toISOString(),
    });

    if (item === null) {
      log.warning(
        `${origem}: item malformado (rótulo de preço ausente) em ${url}`,
      );
      return;
    }

    await dataset.pushData([item]);
    log.info(`${origem}: item extraído em ${url}`);
  });

  return router;
}
