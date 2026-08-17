import { createPlaywrightRouter, type Dataset } from 'crawlee';

import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import type { RawListingItem } from '../../persistence/raw-listing-item.js';
import { getTransactionType } from '../shared/request-user-data.js';

const CARD_SELECTOR = 'li[data-cy="rp-property-cd"] > a';
const NEXT_LINK_SELECTOR = 'a[aria-label="próxima página"]';

export function createZapImoveisRouter(dataset: Dataset<RawListingItem>) {
  const router = createPlaywrightRouter();

  router.addDefaultHandler(async ({ page, request, enqueueLinks, log }) => {
    const transactionType = getTransactionType(request.userData);

    await page
      .waitForSelector(CARD_SELECTOR, { timeout: 10_000 })
      .catch(() => undefined);

    const items = await page.$$eval(
      CARD_SELECTOR,
      (anchors, { origin, transactionType: itemTransactionType }) =>
        // eslint-disable-next-line sonarjs/cognitive-complexity
        (anchors as HTMLAnchorElement[]).map((anchor) => {
          const link = anchor.href;

          // URL do anúncio: /imovel/<transacao>-<tipo>-.../ — o tipo é o segundo
          // segmento do slug (ex.: "venda-casa-4-quartos-..." -> "casa"). Alguns
          // cards não têm href (ex.: lançamentos) — link fica '' e é descartado
          // depois pelo filtro de validItems, então pulamos o parsing aqui.
          let propertyType: string | null = null;
          if (link !== '') {
            const pathSegments = new URL(link).pathname
              .split('/')
              .filter(Boolean);
            const imovelIndex = pathSegments.indexOf('imovel');
            const slug =
              imovelIndex !== -1 ? pathSegments[imovelIndex + 1] : undefined;
            const slugParts = slug !== undefined ? slug.split('-') : [];
            propertyType = slugParts[1] ?? null;
          }

          const titleEl = anchor.querySelector<HTMLElement>(
            'h2[data-cy="rp-cardProperty-location-txt"]',
          );
          const subtitleEl = anchor.querySelector<HTMLElement>(
            'p[data-cy="rp-cardProperty-street-txt"]',
          );
          const title = [
            titleEl?.innerText.trim() ?? '',
            subtitleEl?.innerText.trim() ?? '',
          ]
            .filter(Boolean)
            .join(' - ');

          let location = '';
          if (titleEl) {
            const lastChild = titleEl.childNodes[titleEl.childNodes.length - 1];
            location = (lastChild?.textContent ?? '').trim();
          }

          const bedroomsText =
            anchor.querySelector<HTMLElement>(
              'li[data-cy="rp-cardProperty-bedroomQuantity-txt"] h3',
            )?.textContent ?? '';
          const bedrooms = Number(/\d+/.exec(bedroomsText)?.[0] ?? '0');

          const bathroomsText =
            anchor.querySelector<HTMLElement>(
              'li[data-cy="rp-cardProperty-bathroomQuantity-txt"] h3',
            )?.textContent ?? '';
          const bathrooms = Number(/\d+/.exec(bathroomsText)?.[0] ?? '0');

          const parkingText =
            anchor.querySelector<HTMLElement>(
              'li[data-cy="rp-cardProperty-parkingSpacesQuantity-txt"] h3',
            )?.textContent ?? '';
          const parkingMatch = /\d+/.exec(parkingText);
          const parkingSpots = parkingMatch ? Number(parkingMatch[0]) : null;

          const areaText =
            anchor.querySelector<HTMLElement>(
              'li[data-cy="rp-cardProperty-propertyArea-txt"] h3',
            )?.textContent ?? '';
          const areaMatch = /(\d+)/.exec(areaText);
          const area = areaMatch ? Number(areaMatch[1]) : 0;

          let price = 0;
          let iptu = 0;
          let condominio = 0;
          const priceContainer = anchor.querySelector(
            'div[data-cy="rp-cardProperty-price-txt"]',
          );
          if (priceContainer) {
            const priceText =
              priceContainer.querySelector<HTMLElement>('p.typo-body-large')
                ?.innerText ?? '';
            price = Number(priceText.replace(/\D/g, '')) || 0;

            for (const p of priceContainer.querySelectorAll<HTMLElement>('p')) {
              const text = p.innerText;
              const condMatch = /Cond\.\s*R\$\s*([\d.,]+)/i.exec(text);
              if (condMatch)
                condominio =
                  Number((condMatch[1] ?? '').replace(/\D/g, '')) || 0;
              const iptuMatch = /IPTU\s*R\$\s*([\d.,]+)/i.exec(text);
              if (iptuMatch)
                iptu = Number((iptuMatch[1] ?? '').replace(/\D/g, '')) || 0;
            }
          }

          const item: RawListingItem = {
            origin,
            transactionType: itemTransactionType,
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
          };
          return item;
        }),
      { origin: OrigemAnuncio.ZAP_IMOVEIS, transactionType },
    );

    const validItems = items.filter((item) => item.link !== '');
    if (validItems.length > 0) {
      await dataset.pushData(validItems);
    }
    log.info(
      `ZAP Imóveis: ${String(validItems.length)} anúncio(s) em ${page.url()}`,
    );

    const nextHref = await page.evaluate((selector) => {
      const nextLink = document.querySelector<HTMLAnchorElement>(selector);
      if (!nextLink || nextLink.getAttribute('aria-disabled') === 'true')
        return null;
      return nextLink.href || null;
    }, NEXT_LINK_SELECTOR);

    if (nextHref !== null) {
      await enqueueLinks({ urls: [nextHref], userData: { transactionType } });
    }
  });

  return router;
}
