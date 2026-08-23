import { createCheerioRouter, type Dataset } from 'crawlee';

import { FormatoCaptura } from '../../persistence/enums/formato-captura.enum.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoPaginaCaptura } from '../../persistence/enums/tipo-pagina-captura.enum.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import type { RawListingItem } from '../../persistence/raw-listing-item.js';
import { getTipoTransacao } from '../shared/request-user-data.js';

const CARD_SELECTOR = 'li[data-cy="rp-property-cd"]';
const NEXT_LINK_SELECTOR = 'a[aria-label="próxima página"]';

// URL do anúncio: /imovel/<tipo>-<quartos>-quartos-.../ — o tipo é o primeiro
// segmento do slug (ex.: "casa-2-quartos-..." -> "casa").
function extractTipoImovel(link: string): string | null {
  const pathSegments = new URL(link).pathname.split('/').filter(Boolean);
  const imovelIndex = pathSegments.indexOf('imovel');
  if (imovelIndex === -1) return null;
  const slug = pathSegments[imovelIndex + 1];
  return slug !== undefined ? (slug.split('-')[0] ?? null) : null;
}

export function createVivaRealRouter(
  dataset: Dataset<RawListingItem>,
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

    const items: RawListingItem[] = [];

    $(CARD_SELECTOR).each((_, card) => {
      const $card = $(card);
      const href = $card.find('a[href]').first().attr('href');
      if (href === undefined) return;
      const link = new URL(href, request.loadedUrl).toString();
      const tipoImovel = extractTipoImovel(link);

      const titulo = $card
        .find('h2[data-cy="rp-cardProperty-location-txt"]')
        .text()
        .trim()
        .replace(/\s+/g, ' ');

      const localizacao = $card
        .find('p[data-cy="rp-cardProperty-street-txt"]')
        .text()
        .trim();

      let area = 0;
      let quartos = 0;
      let banheiros = 0;
      let vagas: number | null = null;

      $card.find('li[data-cy^="rp-cardProperty-"]').each((__, li) => {
        const $li = $(li);
        const cy = $li.attr('data-cy') ?? '';
        const text = $li.text().trim();
        if (cy === 'rp-cardProperty-propertyArea-txt')
          area = Number(text.replace(/\D/g, '')) || 0;
        else if (cy === 'rp-cardProperty-bedroomQuantity-txt')
          quartos = Number(text.replace(/\D/g, '')) || 0;
        else if (cy === 'rp-cardProperty-bathroomQuantity-txt')
          banheiros = Number(text.replace(/\D/g, '')) || 0;
        else if (cy === 'rp-cardProperty-parkingSpacesQuantity-txt')
          vagas = Number(text.replace(/\D/g, '')) || 0;
      });

      let preco = 0;
      let condominio = 0;
      let iptu = 0;
      const $priceContainer = $card.find(
        'div[data-cy="rp-cardProperty-price-txt"]',
      );
      if ($priceContainer.length > 0) {
        // O preço é o primeiro <p> do container — a classe exata varia entre o
        // HTML servido (SSR) e o DOM pós-hidratação, então evitamos depender dela.
        const priceText = $priceContainer.find('p').first().text();
        preco = Number(priceText.replace(/\D/g, '')) || 0;

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
        origem: OrigemAnuncio.VIVA_REAL,
        tipoTransacao,
        tipoImovel,
        link,
        titulo,
        quartos,
        banheiros,
        vagas,
        area,
        localizacao,
        dataDePublicacaoText: null,
        preco,
        iptu,
        condominio,
        precoAntigo: null,
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
