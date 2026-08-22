import { createPlaywrightRouter, type Dataset } from 'crawlee';

import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import type { RawListingItem } from '../../persistence/raw-listing-item.js';
import { getTransactionType } from '../shared/request-user-data.js';

const CARD_SELECTOR = '[data-qa="posting PROPERTY"]';
const NEXT_LINK_SELECTOR = '[data-qa="PAGING_NEXT"]';

// robots.txt do Imovelweb (https://www.imovelweb.com.br/robots.txt) dá Allow
// explícito só até "pagina-5.html" e Disallow para o resto
// (`Disallow: /*pagina-*.html`, com Allow pontual sobrepondo 2–5). Página 1 (sem
// sufixo) não é atingida por nenhuma regra de paginação.
const MAX_ALLOWED_PAGE = 5;
const PAGE_NUMBER_PATTERN = /-pagina-(\d+)\.html(?:[?#]|$)/;

export function createImovelwebRouter(dataset: Dataset<RawListingItem>) {
  const router = createPlaywrightRouter();

  router.addDefaultHandler(async ({ page, request, enqueueLinks, log }) => {
    const transactionType = getTransactionType(request.userData);

    // A Cloudflare roda um desafio JS em segundo plano nesta fonte (diagnosticado em
    // .claude/__workdir/integra-imovelweb/diagnostico-imovelweb.md) — às vezes passa sozinho
    // em ~1s, às vezes não passa dentro de 30s, principalmente em modo headless (medido ao
    // vivo, ver seção "Implementação" do diagnóstico). 30s dá margem real sem travar
    // indefinidamente; se o card não aparecer nesse prazo, o handler segue mesmo assim e
    // loga 0 anúncios em vez de lançar erro — não há, e não deve haver, nenhuma tentativa
    // de resolver o desafio interativamente (vetado por
    // terrestre__scraping-responsavel.skill).
    await page
      .waitForSelector(CARD_SELECTOR, { timeout: 30_000 })
      .catch(() => undefined);

    const items = await page.$$eval(
      CARD_SELECTOR,
      (cards, { origin, transactionType: itemTransactionType }) =>
        (cards as HTMLElement[]).map((card) => {
          const toPosting = card.getAttribute('data-to-posting') ?? '';
          const link =
            toPosting !== ''
              ? new URL(toPosting, window.location.origin).toString()
              : '';

          // Slug do anúncio: /propriedades/<tipo>-para-<transacao>-.../ — o tipo é o
          // trecho antes de "-para-" (ex.: "apartamento-para-locacao-..." ->
          // "apartamento"). Alguns slugs não seguem esse padrão (ex.: nome de
          // condomínio sem "-para-"); nesses casos o tipo fica null, igual às demais
          // fontes quando o HTML não dá sinal confiável.
          const slug = toPosting.split('/').filter(Boolean).pop() ?? '';
          const propertyTypeMatch = /^(.+?)-para-/.exec(slug);
          const propertyType = propertyTypeMatch
            ? (propertyTypeMatch[1] ?? null)
            : null;

          const priceText =
            card.querySelector<HTMLElement>('[data-qa="POSTING_CARD_PRICE"]')
              ?.innerText ?? '';
          const price = Number(priceText.replace(/\D/g, '')) || 0;

          // "expensas" só carrega o condomínio nesta fonte — IPTU não aparece no card
          // de listagem, só na página de detalhe (fora de escopo deste crawler).
          let condominio = 0;
          const expensasText =
            card.querySelector<HTMLElement>('[data-qa="expensas"]')
              ?.innerText ?? '';
          if (/condom/i.test(expensasText)) {
            condominio = Number(expensasText.replace(/\D/g, '')) || 0;
          }

          let bedrooms = 0;
          let bathrooms = 0;
          let area = 0;
          let parkingSpots: number | null = null;
          const featureSpans = card.querySelectorAll<HTMLElement>(
            '[data-qa="POSTING_CARD_FEATURES"] span',
          );
          for (const span of featureSpans) {
            const text = span.innerText.trim().toLowerCase();
            const match = /(\d+)/.exec(text);
            const value = match ? Number(match[1]) : null;
            if (value === null) continue;
            if (text.includes('quarto')) bedrooms = value;
            else if (text.includes('banheiro')) bathrooms = value;
            else if (text.includes('vaga')) parkingSpots = value;
            else if (text.includes('m²')) area = value;
          }

          const location =
            card
              .querySelector<HTMLElement>('[data-qa="POSTING_CARD_LOCATION"]')
              ?.innerText.trim() ?? '';
          const title =
            card
              .querySelector<HTMLElement>(
                '[data-qa="POSTING_CARD_DESCRIPTION"]',
              )
              ?.innerText.trim() ?? '';

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
            iptu: 0,
            condominio,
            oldPrice: null,
          };
          return item;
        }),
      { origin: OrigemAnuncio.IMOVELWEB, transactionType },
    );

    const validItems = items.filter((item) => item.link !== '');
    if (validItems.length > 0) {
      await dataset.pushData(validItems);
    }
    log.info(
      `Imovelweb: ${String(validItems.length)} anúncio(s) em ${page.url()}`,
    );

    // Paginação respeita o robots.txt do Imovelweb (ver constantes no topo do
    // arquivo): só segue PAGING_NEXT enquanto a próxima página estiver dentro do
    // intervalo permitido (1–5). maxRequestsPerCrawl (crawler-defaults.ts) continua
    // sendo o teto geral do crawler, mas nesta fonte o limite de robots.txt é
    // atingido primeiro.
    const nextHref = await page.evaluate((selector) => {
      const nextLink = document.querySelector<HTMLAnchorElement>(selector);
      return nextLink?.getAttribute('href') ?? null;
    }, NEXT_LINK_SELECTOR);

    if (nextHref !== null) {
      const nextPageMatch = PAGE_NUMBER_PATTERN.exec(nextHref);
      const nextPageNumber =
        nextPageMatch?.[1] !== undefined ? Number(nextPageMatch[1]) : null;

      if (nextPageNumber !== null && nextPageNumber > MAX_ALLOWED_PAGE) {
        log.info(
          `Imovelweb: robots.txt permite paginação só até a página ${String(MAX_ALLOWED_PAGE)}; parando em ${page.url()}`,
        );
      } else {
        await enqueueLinks({
          urls: [new URL(nextHref, request.loadedUrl).toString()],
          userData: { transactionType },
        });
      }
    }
  });

  return router;
}
