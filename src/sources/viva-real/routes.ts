import { createCheerioRouter, type Dataset } from 'crawlee';

import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import type { RawListingItem } from '../../persistence/raw-listing-item.js';
import { getTransactionType } from '../shared/request-user-data.js';

const CARD_SELECTOR = 'li[data-cy="rp-property-cd"]';
const NEXT_LINK_SELECTOR = 'a[aria-label="próxima página"]';

// URL do anúncio: /imovel/<tipo>-<quartos>-quartos-.../ — o tipo é o primeiro
// segmento do slug (ex.: "casa-2-quartos-..." -> "casa").
function extractPropertyType(link: string): string | null {
  const pathSegments = new URL(link).pathname.split('/').filter(Boolean);
  const imovelIndex = pathSegments.indexOf('imovel');
  if (imovelIndex === -1) return null;
  const slug = pathSegments[imovelIndex + 1];
  return slug !== undefined ? (slug.split('-')[0] ?? null) : null;
}

export function createVivaRealRouter(dataset: Dataset<RawListingItem>) {
  const router = createCheerioRouter();

  router.addDefaultHandler(async ({ $, request, enqueueLinks, log }) => {
    const transactionType = getTransactionType(request.userData);
    const items: RawListingItem[] = [];

    $(CARD_SELECTOR).each((_, card) => {
      const $card = $(card);
      const href = $card.find('a[href]').first().attr('href');
      if (href === undefined) return;
      const link = new URL(href, request.loadedUrl).toString();
      const propertyType = extractPropertyType(link);

      const title = $card
        .find('h2[data-cy="rp-cardProperty-location-txt"]')
        .text()
        .trim()
        .replace(/\s+/g, ' ');

      const location = $card
        .find('p[data-cy="rp-cardProperty-street-txt"]')
        .text()
        .trim();

      let area = 0;
      let bedrooms = 0;
      let bathrooms = 0;
      let parkingSpots: number | null = null;

      $card.find('li[data-cy^="rp-cardProperty-"]').each((__, li) => {
        const $li = $(li);
        const cy = $li.attr('data-cy') ?? '';
        const text = $li.text().trim();
        if (cy === 'rp-cardProperty-propertyArea-txt')
          area = Number(text.replace(/\D/g, '')) || 0;
        else if (cy === 'rp-cardProperty-bedroomQuantity-txt')
          bedrooms = Number(text.replace(/\D/g, '')) || 0;
        else if (cy === 'rp-cardProperty-bathroomQuantity-txt')
          bathrooms = Number(text.replace(/\D/g, '')) || 0;
        else if (cy === 'rp-cardProperty-parkingSpacesQuantity-txt')
          parkingSpots = Number(text.replace(/\D/g, '')) || 0;
      });

      let price = 0;
      let condominio = 0;
      let iptu = 0;
      const $priceContainer = $card.find(
        'div[data-cy="rp-cardProperty-price-txt"]',
      );
      if ($priceContainer.length > 0) {
        // O preço é o primeiro <p> do container — a classe exata varia entre o
        // HTML servido (SSR) e o DOM pós-hidratação, então evitamos depender dela.
        const priceText = $priceContainer.find('p').first().text();
        price = Number(priceText.replace(/\D/g, '')) || 0;

        $priceContainer.find('p').each((__, p) => {
          const text = $(p).text();
          const condMatch = /Cond\.\s*R\$\s*([\d.,]+)/i.exec(text);
          if (condMatch)
            condominio = Number((condMatch[1] ?? '').replace(/\D/g, '')) || 0;
          const iptuMatch = /IPTU\s*R\$\s*([\d.,]+)/i.exec(text);
          if (iptuMatch)
            iptu = Number((iptuMatch[1] ?? '').replace(/\D/g, '')) || 0;
        });
      }

      items.push({
        origin: OrigemAnuncio.VIVA_REAL,
        transactionType,
        propertyType,
        link,
        title,
        bedrooms,
        bathrooms,
        parkingSpots,
        area,
        location,
        datePostedText: null,
        price,
        iptu,
        condominio,
        oldPrice: null,
      });
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
      await enqueueLinks({ urls: [nextHref], userData: { transactionType } });
    }
  });

  return router;
}
