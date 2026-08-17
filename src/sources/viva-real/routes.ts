import { createPlaywrightRouter, type Dataset } from 'crawlee';

import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import type { RawListingItem } from '../../persistence/raw-listing-item.js';

const CARD_SELECTOR = 'li[data-cy="rp-property-cd"]';
const NEXT_LINK_SELECTOR = 'a[aria-label="próxima página"]';

export function createVivaRealRouter(dataset: Dataset<RawListingItem>) {
  const router = createPlaywrightRouter();

  router.addDefaultHandler(async ({ page, enqueueLinks, log }) => {
    await page
      .waitForSelector(CARD_SELECTOR, { timeout: 10_000 })
      .catch(() => undefined);

    const items = await page.$$eval(
      CARD_SELECTOR,
      (cards, origin) =>
        cards
          // Complexidade ciclomática alta é inerente aqui: tudo precisa estar num
          // único callback anônimo, sem funções nomeadas auxiliares — o esbuild/tsx
          // injeta um helper `__name()` no escopo do módulo para preservar nomes de
          // função, que não existe mais quando o Playwright serializa só este
          // callback pro contexto do browser (ReferenceError: __name is not
          // defined). Ver mesmo padrão em olx/routes.ts.
          // eslint-disable-next-line sonarjs/cognitive-complexity
          .map((card) => {
            const linkEl = card.querySelector<HTMLAnchorElement>('a[href]');
            if (!linkEl) return null;
            const link = linkEl.href;

            const title = (
              card.querySelector<HTMLElement>(
                'h2[data-cy="rp-cardProperty-location-txt"]',
              )?.innerText ?? ''
            )
              .trim()
              .replace(/\s+/g, ' ');

            const location =
              card
                .querySelector<HTMLElement>(
                  'p[data-cy="rp-cardProperty-street-txt"]',
                )
                ?.innerText.trim() ?? '';

            let area = 0;
            let bedrooms = 0;
            let bathrooms = 0;
            let parkingSpots: number | null = null;

            for (const li of card.querySelectorAll<HTMLElement>(
              'li[data-cy^="rp-cardProperty-"]',
            )) {
              const cy = li.dataset.cy ?? '';
              const text = li.innerText.trim();
              if (cy === 'rp-cardProperty-propertyArea-txt')
                area = Number(text.replace(/\D/g, '')) || 0;
              else if (cy === 'rp-cardProperty-bedroomQuantity-txt')
                bedrooms = Number(text.replace(/\D/g, '')) || 0;
              else if (cy === 'rp-cardProperty-bathroomQuantity-txt')
                bathrooms = Number(text.replace(/\D/g, '')) || 0;
              else if (cy === 'rp-cardProperty-parkingSpacesQuantity-txt')
                parkingSpots = Number(text.replace(/\D/g, '')) || 0;
            }

            let price = 0;
            let condominio = 0;
            let iptu = 0;
            const priceContainer = card.querySelector(
              'div[data-cy="rp-cardProperty-price-txt"]',
            );
            if (priceContainer) {
              const priceText =
                priceContainer.querySelector<HTMLElement>('p.typo-body-large')
                  ?.innerText ?? '';
              price = Number(priceText.replace(/\D/g, '')) || 0;

              for (const p of priceContainer.querySelectorAll<HTMLElement>(
                'p',
              )) {
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
          })
          .filter((item): item is RawListingItem => item !== null),
      OrigemAnuncio.VIVA_REAL,
    );

    if (items.length > 0) {
      await dataset.pushData(items);
    }
    log.info(`Viva Real: ${String(items.length)} anúncio(s) em ${page.url()}`);

    const nextHref = await page.evaluate((selector) => {
      const nextLink = document.querySelector<HTMLAnchorElement>(selector);
      if (!nextLink || nextLink.getAttribute('aria-disabled') === 'true')
        return null;
      return nextLink.href || null;
    }, NEXT_LINK_SELECTOR);

    if (nextHref !== null) {
      await enqueueLinks({ urls: [nextHref] });
    }
  });

  return router;
}
