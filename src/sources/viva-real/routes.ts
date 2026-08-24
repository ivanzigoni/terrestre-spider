import { createCheerioRouter, type Dataset } from 'crawlee';

import { FormatoCaptura } from '../../persistence/enums/formato-captura.enum.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoPaginaCaptura } from '../../persistence/enums/tipo-pagina-captura.enum.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import type { LinkAnuncio } from '../../persistence/link-anuncio.js';
import { getTipoTransacao } from '../shared/request-user-data.js';

const CARD_SELECTOR = 'li[data-cy="rp-property-cd"]';
const NEXT_LINK_SELECTOR = 'a[aria-label="próxima página"]';

export function createVivaRealRouter(
  dataset: Dataset<LinkAnuncio>,
  capturaDataset: Dataset<RawCaptureItem>,
) {
  const router = createCheerioRouter();

  router.addDefaultHandler(async ({ $, request, enqueueLinks, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);

    await capturaDataset.pushData({
      origem: OrigemAnuncio.VIVA_REAL,
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
      const href = $card.find('a[href]').first().attr('href');
      if (href === undefined) return;
      const link = new URL(href, request.loadedUrl).toString();

      items.push({ link, tipoTransacao });
    });

    if (items.length > 0) {
      await dataset.pushData(items);
    }
    log.info(
      `Viva Real: ${String(items.length)} anúncio(s) em ${request.loadedUrl}`,
    );

    const $nextLink = $(NEXT_LINK_SELECTOR);
    let nextHref: string | null = null;
    if ($nextLink.length > 0 && $nextLink.attr('aria-disabled') !== 'true') {
      const href = $nextLink.attr('href');
      if (href !== undefined)
        nextHref = new URL(href, request.loadedUrl).toString();
    }

    if (nextHref !== null) {
      await enqueueLinks({ urls: [nextHref], userData: { tipoTransacao } });
    }
  });

  return router;
}

/**
 * Router da fase de detalhe — visita a página do próprio anúncio (o `link` já extraído
 * pelo router de listagem acima) e grava o HTML bruto, sem extração estruturada.
 */
export function createVivaRealDetalheRouter(
  capturaDataset: Dataset<RawCaptureItem>,
) {
  const router = createCheerioRouter();

  router.addDefaultHandler(async ({ $, request, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);

    await capturaDataset.pushData({
      origem: OrigemAnuncio.VIVA_REAL,
      tipoTransacao,
      tipoPagina: TipoPaginaCaptura.DETALHE,
      url: request.loadedUrl,
      formato: FormatoCaptura.HTML,
      conteudo: $.html(),
      capturadoEm: new Date().toISOString(),
    });
    log.info(`Viva Real: detalhe capturado em ${request.loadedUrl}`);
  });

  return router;
}
