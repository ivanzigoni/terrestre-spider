import { createPlaywrightRouter, type Dataset } from 'crawlee';

import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import type { RawListingItem } from '../../persistence/raw-listing-item.js';
import { getTipoTransacao } from '../shared/request-user-data.js';

const CARD_SELECTOR = 'div.row.imoveis article.card-imovel';
// Netimóveis pagina via clique em JS (sem href estável no botão), mas a URL de busca
// já aceita o parâmetro `pagina` (ver src/config/search-urls.json) — em vez de clicar,
// calculamos a próxima URL incrementando esse parâmetro e enfileiramos diretamente.
const NEXT_BUTTON_SELECTOR = 'nav ul.pagination li.clnext';

export function createNetimoveisRouter(dataset: Dataset<RawListingItem>) {
  const router = createPlaywrightRouter();

  router.addDefaultHandler(async ({ page, request, enqueueLinks, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);

    await page
      .waitForSelector(CARD_SELECTOR, { timeout: 10_000 })
      .catch(() => undefined);

    const items = await page.$$eval(
      CARD_SELECTOR,
      (cards, { origem, tipoTransacao: itemTipoTransacao }) =>
        cards.map((card) => {
          const linkEl = card.querySelector<HTMLAnchorElement>('a.link-imovel');
          const link = linkEl?.href ?? '';
          const tipoImovel =
            link !== '' ? new URL(link).searchParams.get('tipoUrl') : null;

          const titulo = (
            card.querySelector<HTMLElement>('section.imovel-info h2')
              ?.textContent ?? ''
          )
            .trim()
            .replace(/\s+/g, ' ');

          const localizacao =
            card.querySelector<HTMLElement>('.endereco')?.textContent.trim() ??
            '';

          const areaText =
            card
              .querySelector<HTMLElement>('.caracteristica.area')
              ?.textContent.trim() ?? '';
          const area =
            Number((areaText.split(',')[0] ?? '').replace(/\D/g, '')) || 0;

          const bedroomsText =
            card
              .querySelector<HTMLElement>('.caracteristica.quartos')
              ?.textContent.trim() ?? '';
          const quartos = Number(/\d+/.exec(bedroomsText)?.[0] ?? '0');

          const bathroomsText =
            card
              .querySelector<HTMLElement>('.caracteristica.banheiros')
              ?.textContent.trim() ?? '';
          const banheiros = Number(/\d+/.exec(bathroomsText)?.[0] ?? '0');

          const vagasText =
            card
              .querySelector<HTMLElement>('.caracteristica.vagas')
              ?.textContent.trim() ?? '';
          const vagasMatch = /\d+/.exec(vagasText);
          const vagas = vagasMatch ? Number(vagasMatch[0]) : null;

          const preco =
            Number(
              (
                card.querySelector<HTMLElement>('.imovel-valor .valor')
                  ?.textContent ?? ''
              ).replace(/\D/g, ''),
            ) || 0;
          const condominio =
            Number(
              (
                card.querySelector<HTMLElement>('.imovel-valor .condominio')
                  ?.textContent ?? ''
              ).replace(/\D/g, ''),
            ) || 0;

          const dataDePublicacaoText =
            card
              .querySelector<HTMLElement>('.ultima-atualizacao')
              ?.textContent.trim() ?? null;

          const item: RawListingItem = {
            origem,
            tipoTransacao: itemTipoTransacao,
            tipoImovel,
            link,
            titulo,
            quartos,
            banheiros,
            vagas,
            area,
            localizacao,
            dataDePublicacaoText,
            preco,
            iptu: 0,
            condominio,
            precoAntigo: null,
          };
          return item;
        }),
      { origem: OrigemAnuncio.NETIMOVEIS, tipoTransacao },
    );

    const validItems = items.filter((item) => item.link !== '');
    if (validItems.length > 0) {
      await dataset.pushData(validItems);
    }
    log.info(
      `Netimóveis: ${String(validItems.length)} anúncio(s) em ${page.url()}`,
    );

    const hasNext = await page.evaluate((selector) => {
      const nextBtn = document.querySelector(selector);
      return nextBtn !== null && !nextBtn.classList.contains('disabled');
    }, NEXT_BUTTON_SELECTOR);

    if (hasNext) {
      const currentUrl = new URL(request.loadedUrl);
      const currentPage = Number(currentUrl.searchParams.get('pagina') ?? '1');
      currentUrl.searchParams.set('pagina', String(currentPage + 1));
      await enqueueLinks({
        urls: [currentUrl.toString()],
        userData: { tipoTransacao },
      });
    }
  });

  return router;
}
