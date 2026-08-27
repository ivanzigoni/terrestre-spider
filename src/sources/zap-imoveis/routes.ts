import { createPlaywrightRouter, type Dataset } from 'crawlee';

import { FormatoCaptura } from '../../persistence/enums/formato-captura.enum.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoPaginaCaptura } from '../../persistence/enums/tipo-pagina-captura.enum.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import type { LinkAnuncio } from '../../persistence/link-anuncio.js';
import { getTipoTransacao } from '../shared/request-user-data.js';

const CARD_SELECTOR = 'li[data-cy="rp-property-cd"] > a';
const NEXT_LINK_SELECTOR = 'a[aria-label="próxima página"]';

export function createZapImoveisRouter(
  dataset: Dataset<LinkAnuncio>,
  capturaDataset: Dataset<RawCaptureItem>,
) {
  const router = createPlaywrightRouter();

  router.addDefaultHandler(async ({ page, request, enqueueLinks, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);

    await page
      .waitForSelector(CARD_SELECTOR, { timeout: 10_000 })
      .catch(() => undefined);

    await capturaDataset.pushData({
      origem: OrigemAnuncio.ZAP_IMOVEIS,
      tipoTransacao,
      tipoPagina: TipoPaginaCaptura.LISTAGEM,
      url: page.url(),
      formato: FormatoCaptura.HTML,
      conteudo: await page.content(),
      capturadoEm: new Date().toISOString(),
    });

    const items = await page.$$eval(
      CARD_SELECTOR,
      (anchors, { tipoTransacao: itemTipoTransacao }) =>
        (anchors as HTMLAnchorElement[]).map((anchor) => {
          const item: LinkAnuncio = {
            link: anchor.href,
            tipoTransacao: itemTipoTransacao,
          };
          return item;
        }),
      { tipoTransacao },
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
      await enqueueLinks({ urls: [nextHref], userData: { tipoTransacao } });
    }
  });

  return router;
}

/**
 * Router da fase de detalhe — visita a página do próprio anúncio (o `link` já extraído
 * pelo router de listagem acima) e grava o HTML bruto, sem extração estruturada. Sem
 * `waitForSelector` específico (a marcação da página de detalhe ainda não foi
 * diagnosticada) — captura o que o carregamento padrão do Playwright já trouxer; uma
 * captura vazia/suspeita aparece nos logs pra diagnóstico posterior, mesma filosofia do
 * handler de listagem acima com o desafio Cloudflare do Imovelweb.
 */
export function createZapImoveisDetalheRouter(
  capturaDataset: Dataset<RawCaptureItem>,
) {
  const router = createPlaywrightRouter();

  router.addDefaultHandler(async ({ page, request, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);

    await capturaDataset.pushData({
      origem: OrigemAnuncio.ZAP_IMOVEIS,
      tipoTransacao,
      tipoPagina: TipoPaginaCaptura.DETALHE,
      url: page.url(),
      formato: FormatoCaptura.HTML,
      conteudo: await page.content(),
      capturadoEm: new Date().toISOString(),
    });
    log.info(`ZAP Imóveis: detalhe capturado em ${page.url()}`);
  });

  return router;
}
