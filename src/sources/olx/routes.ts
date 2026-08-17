import { createPlaywrightRouter, type Dataset } from 'crawlee';

import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import type { RawListingItem } from '../../persistence/raw-listing-item.js';

const CARD_SELECTOR = 'section.olx-adcard';

export function createOlxRouter(dataset: Dataset<RawListingItem>) {
  const router = createPlaywrightRouter();

  router.addDefaultHandler(async ({ page, request, enqueueLinks, log }) => {
    await page
      .waitForSelector(CARD_SELECTOR, { timeout: 10_000 })
      .catch(() => undefined);

    const items = await page.$$eval(
      CARD_SELECTOR,
      (cards, origin) =>
        cards.map((card) => {
          const linkEl = card.querySelector<HTMLAnchorElement>(
            'a.olx-adcard__link[href]',
          );
          const link = linkEl?.href ?? '';
          const title = linkEl ? linkEl.title || linkEl.innerText.trim() : '';

          let bedrooms = 0;
          let bathrooms = 0;
          let area = 0;
          let parkingSpots: number | null = null;

          for (const detail of card.querySelectorAll<HTMLElement>(
            '.olx-adcard__detail',
          )) {
            const label = (
              detail.getAttribute('aria-label') ?? ''
            ).toLowerCase();
            const text = detail.innerText.trim().toLowerCase();
            const match = /(\d+)/.exec(label);
            const value = match ? Number(match[1]) : null;
            if (value === null) continue;

            if (label.includes('quarto')) bedrooms = value;
            else if (
              label.includes('metro') ||
              label.includes('m²') ||
              text.includes('m²')
            )
              area = value;
            else if (label.includes('banheiro')) bathrooms = value;
            else if (label.includes('vaga')) parkingSpots = value;
          }

          const priceText =
            card.querySelector<HTMLElement>('h3.olx-adcard__price')
              ?.innerText ?? '';
          const price = Number(priceText.replace(/\D/g, '')) || 0;

          let iptu = 0;
          let condominio = 0;
          for (const el of card.querySelectorAll<HTMLElement>(
            'div.olx-adcard__price-info',
          )) {
            const text = el.innerText.trim().toLowerCase();
            if (text.startsWith('iptu'))
              iptu = Number(text.replace(/\D/g, '')) || 0;
            else if (
              text.startsWith('condomínio') ||
              text.startsWith('condominio')
            )
              condominio = Number(text.replace(/\D/g, '')) || 0;
          }

          const location =
            card
              .querySelector<HTMLElement>('p.olx-adcard__location')
              ?.innerText.trim() ?? '';
          const datePostedText =
            card
              .querySelector<HTMLElement>('p.olx-adcard__date')
              ?.innerText.trim() ?? null;

          const item: RawListingItem = {
            origin,
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
          };
          return item;
        }),
      OrigemAnuncio.OLX,
    );

    const validItems = items.filter((item) => item.link !== '');
    if (validItems.length > 0) {
      await dataset.pushData(validItems);
    }
    log.info(`OLX: ${String(validItems.length)} anúncio(s) em ${page.url()}`);

    // A OLX não expõe um link "próxima página" — só uma paginação numerada
    // (?o=N na URL). Em vez de adivinhar rótulo, procuramos o link cujo texto
    // é o número da próxima página; sua ausência já é o sinal de última página.
    const currentPage = Number(
      new URL(request.loadedUrl).searchParams.get('o') ?? '1',
    );
    const nextHref = await page.evaluate(
      (nextPageLabel) => {
        const nextAnchor = Array.from(document.querySelectorAll('a')).find(
          (a) => a.textContent.trim() === nextPageLabel,
        );
        return nextAnchor instanceof HTMLAnchorElement ? nextAnchor.href : null;
      },
      String(currentPage + 1),
    );

    if (nextHref !== null) {
      await enqueueLinks({ urls: [nextHref] });
    }
  });

  return router;
}
