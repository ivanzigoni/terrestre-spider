import { createCheerioRouter, type Dataset } from 'crawlee';

import { FormatoCaptura } from '../../persistence/enums/formato-captura.enum.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoPaginaCaptura } from '../../persistence/enums/tipo-pagina-captura.enum.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import type { LinkAnuncio } from '../../persistence/link-anuncio.js';
import { getTipoTransacao } from '../shared/request-user-data.js';

const CARD_SELECTOR = 'section.olx-adcard';

export function createOlxRouter(
  dataset: Dataset<LinkAnuncio>,
  capturaDataset: Dataset<RawCaptureItem>,
) {
  const router = createCheerioRouter();

  router.addDefaultHandler(async ({ $, request, enqueueLinks, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);

    // Captura bruta da página inteira — incondicional (mesmo com 0 cards, é o caso mais
    // útil pra diagnosticar página vazia/bloqueada depois) e antes do parsing dos cards.
    await capturaDataset.pushData({
      origem: OrigemAnuncio.OLX,
      tipoTransacao,
      tipoPagina: TipoPaginaCaptura.LISTAGEM,
      url: request.loadedUrl,
      formato: FormatoCaptura.HTML,
      conteudo: $.html(),
      capturadoEm: new Date().toISOString(),
    });

    const items: LinkAnuncio[] = [];

    $(CARD_SELECTOR).each((_, card) => {
      const $card = $(card);
      const linkEl = $card.find('a.olx-adcard__link[href]').first();
      const href = linkEl.attr('href');
      const link =
        href !== undefined ? new URL(href, request.loadedUrl).toString() : '';
      if (link === '') return;

      items.push({ link, tipoTransacao });
    });

    if (items.length > 0) {
      await dataset.pushData(items);
    }
    log.info(`OLX: ${String(items.length)} anúncio(s) em ${request.loadedUrl}`);

    // A OLX não expõe um link "próxima página" — só uma paginação numerada
    // (?o=N na URL). Em vez de adivinhar rótulo, procuramos o link cujo texto
    // é o número da próxima página; sua ausência já é o sinal de última página.
    const currentPage = Number(
      new URL(request.loadedUrl).searchParams.get('o') ?? '1',
    );
    const nextPageLabel = String(currentPage + 1);
    const $nextAnchor = $('a')
      .filter((_, a) => $(a).text().trim() === nextPageLabel)
      .first();
    const nextHrefAttr =
      $nextAnchor.length > 0 ? $nextAnchor.attr('href') : undefined;

    if (nextHrefAttr !== undefined) {
      await enqueueLinks({
        urls: [new URL(nextHrefAttr, request.loadedUrl).toString()],
        userData: { tipoTransacao },
      });
    }
  });

  return router;
}

/**
 * Router da fase de detalhe — visita a página do próprio anúncio (o `link` já extraído
 * pelo router de listagem acima) e grava o HTML bruto, sem extração estruturada (a
 * captura bruta é o produto desta fase, igual à listagem antes do parsing dos cards).
 */
export function createOlxDetalheRouter(
  capturaDataset: Dataset<RawCaptureItem>,
) {
  const router = createCheerioRouter();

  router.addDefaultHandler(async ({ $, request, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);

    await capturaDataset.pushData({
      origem: OrigemAnuncio.OLX,
      tipoTransacao,
      tipoPagina: TipoPaginaCaptura.DETALHE,
      url: request.loadedUrl,
      formato: FormatoCaptura.HTML,
      conteudo: $.html(),
      capturadoEm: new Date().toISOString(),
    });
    log.info(`OLX: detalhe capturado em ${request.loadedUrl}`);
  });

  return router;
}
