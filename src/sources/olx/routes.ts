import { createCheerioRouter, type Dataset } from 'crawlee';

import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import type { RawListingItem } from '../../persistence/raw-listing-item.js';

const CARD_SELECTOR = 'section.olx-adcard';

export function createOlxRouter(dataset: Dataset<RawListingItem>) {
  const router = createCheerioRouter();

  router.addDefaultHandler(async ({ $, request, enqueueLinks, log }) => {
    const items: RawListingItem[] = [];

    $(CARD_SELECTOR).each((_, card) => {
      const $card = $(card);
      const linkEl = $card.find('a.olx-adcard__link[href]').first();
      const href = linkEl.attr('href');
      const link =
        href !== undefined ? new URL(href, request.loadedUrl).toString() : '';
      const titleAttr = linkEl.attr('title');
      const title =
        titleAttr !== undefined && titleAttr !== ''
          ? titleAttr
          : linkEl.text().trim();

      let bedrooms = 0;
      let bathrooms = 0;
      let area = 0;
      let parkingSpots: number | null = null;

      $card.find('.olx-adcard__detail').each((__, detail) => {
        const $detail = $(detail);
        const label = ($detail.attr('aria-label') ?? '').toLowerCase();
        const text = $detail.text().trim().toLowerCase();
        const match = /(\d+)/.exec(label);
        const value = match ? Number(match[1]) : null;
        if (value === null) return;

        if (label.includes('quarto')) bedrooms = value;
        else if (
          label.includes('metro') ||
          label.includes('m²') ||
          text.includes('m²')
        )
          area = value;
        else if (label.includes('banheiro')) bathrooms = value;
        else if (label.includes('vaga')) parkingSpots = value;
      });

      const priceText = $card.find('h3.olx-adcard__price').text();
      const price = Number(priceText.replace(/\D/g, '')) || 0;

      let iptu = 0;
      let condominio = 0;
      $card.find('div.olx-adcard__price-info').each((__, el) => {
        const text = $(el).text().trim().toLowerCase();
        if (text.startsWith('iptu'))
          iptu = Number(text.replace(/\D/g, '')) || 0;
        else if (text.startsWith('condomínio') || text.startsWith('condominio'))
          condominio = Number(text.replace(/\D/g, '')) || 0;
      });

      const location = $card.find('p.olx-adcard__location').text().trim();
      const datePostedTextRaw = $card.find('p.olx-adcard__date').text().trim();
      const datePostedText =
        datePostedTextRaw === '' ? null : datePostedTextRaw;

      if (link === '') return;

      items.push({
        origin: OrigemAnuncio.OLX,
        link,
        title,
        bedrooms,
        bathrooms,
        parkingSpots,
        area,
        location,
        datePostedText,
        price,
        iptu,
        condominio,
        oldPrice: null,
      });
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
      });
    }
  });

  return router;
}
