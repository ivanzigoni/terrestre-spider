import { createCheerioRouter, type Dataset } from 'crawlee';

import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import type { RawListingItem } from '../../persistence/raw-listing-item.js';
import { getTipoTransacao } from '../shared/request-user-data.js';

const CARD_SELECTOR = 'section.olx-adcard';

export function createOlxRouter(dataset: Dataset<RawListingItem>) {
  const router = createCheerioRouter();

  router.addDefaultHandler(async ({ $, request, enqueueLinks, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);
    const items: RawListingItem[] = [];

    $(CARD_SELECTOR).each((_, card) => {
      const $card = $(card);
      const linkEl = $card.find('a.olx-adcard__link[href]').first();
      const href = linkEl.attr('href');
      const link =
        href !== undefined ? new URL(href, request.loadedUrl).toString() : '';
      if (link === '') return;

      const titleAttr = linkEl.attr('title');
      const titulo =
        titleAttr !== undefined && titleAttr !== ''
          ? titleAttr
          : linkEl.text().trim();

      // A categoria (ex.: "imoveis", "terrenos") é o único sinal de tipo que a OLX
      // serve no HTML puro — o rótulo mais específico ("Apartamento", "Casa") só
      // existe no DOM depois da hidratação, que o CheerioCrawler não executa.
      const tipoImovel =
        new URL(link).pathname.split('/').filter(Boolean)[1] ?? null;

      let quartos = 0;
      let banheiros = 0;
      let area = 0;
      let vagas: number | null = null;

      $card.find('.olx-adcard__detail').each((__, detail) => {
        const $detail = $(detail);
        const label = ($detail.attr('aria-label') ?? '').toLowerCase();
        const text = $detail.text().trim().toLowerCase();
        const match = /(\d+)/.exec(label);
        const value = match ? Number(match[1]) : null;
        if (value === null) return;

        if (label.includes('quarto')) quartos = value;
        else if (
          label.includes('metro') ||
          label.includes('m²') ||
          text.includes('m²')
        )
          area = value;
        else if (label.includes('banheiro')) banheiros = value;
        else if (label.includes('vaga')) vagas = value;
      });

      const priceText = $card.find('h3.olx-adcard__price').text();
      const preco = Number(priceText.replace(/\D/g, '')) || 0;

      let iptu = 0;
      let condominio = 0;
      $card.find('div.olx-adcard__price-info').each((__, el) => {
        const text = $(el).text().trim().toLowerCase();
        if (text.startsWith('iptu'))
          iptu = Number(text.replace(/\D/g, '')) || 0;
        else if (text.startsWith('condomínio') || text.startsWith('condominio'))
          condominio = Number(text.replace(/\D/g, '')) || 0;
      });

      const localizacao = $card.find('p.olx-adcard__location').text().trim();
      const dataDePublicacaoTextRaw = $card
        .find('p.olx-adcard__date')
        .text()
        .trim();
      const dataDePublicacaoText =
        dataDePublicacaoTextRaw === '' ? null : dataDePublicacaoTextRaw;

      items.push({
        origem: OrigemAnuncio.OLX,
        tipoTransacao,
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
        iptu,
        condominio,
        precoAntigo: null,
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
        userData: { tipoTransacao },
      });
    }
  });

  return router;
}
