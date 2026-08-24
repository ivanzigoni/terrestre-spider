import { createPlaywrightRouter, type Dataset } from 'crawlee';

import { FormatoCaptura } from '../../persistence/enums/formato-captura.enum.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoPaginaCaptura } from '../../persistence/enums/tipo-pagina-captura.enum.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import type { LinkAnuncio } from '../../persistence/link-anuncio.js';
import { getTipoTransacao } from '../shared/request-user-data.js';

const CARD_SELECTOR = '[data-qa="posting PROPERTY"]';
const NEXT_LINK_SELECTOR = '[data-qa="PAGING_NEXT"]';

// robots.txt do Imovelweb (https://www.imovelweb.com.br/robots.txt) dá Allow
// explícito só até "pagina-5.html" e Disallow para o resto
// (`Disallow: /*pagina-*.html`, com Allow pontual sobrepondo 2–5). Página 1 (sem
// sufixo) não é atingida por nenhuma regra de paginação.
const MAX_ALLOWED_PAGE = 5;
const PAGE_NUMBER_PATTERN = /-pagina-(\d+)\.html(?:[?#]|$)/;

export function createImovelwebRouter(
  dataset: Dataset<LinkAnuncio>,
  capturaDataset: Dataset<RawCaptureItem>,
) {
  const router = createPlaywrightRouter();

  router.addDefaultHandler(async ({ page, request, enqueueLinks, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);

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

    // Captura incondicional — é justamente o caso do desafio Cloudflare não passar
    // (comentário acima) que essa captura serve pra diagnosticar depois, sem re-raspar.
    await capturaDataset.pushData({
      origem: OrigemAnuncio.IMOVELWEB,
      tipoTransacao,
      tipoPagina: TipoPaginaCaptura.LISTAGEM,
      url: page.url(),
      formato: FormatoCaptura.HTML,
      conteudo: await page.content(),
      capturadoEm: new Date().toISOString(),
    });

    const items = await page.$$eval(
      CARD_SELECTOR,
      (cards, { tipoTransacao: itemTipoTransacao }) =>
        (cards as HTMLElement[]).map((card) => {
          const toPosting = card.getAttribute('data-to-posting') ?? '';
          const link =
            toPosting !== ''
              ? new URL(toPosting, window.location.origin).toString()
              : '';

          const item: LinkAnuncio = { link, tipoTransacao: itemTipoTransacao };
          return item;
        }),
      { tipoTransacao },
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
          userData: { tipoTransacao },
        });
      }
    }
  });

  return router;
}

/**
 * Router da fase de detalhe — visita a página do próprio anúncio (o `link` já extraído
 * pelo router de listagem acima) e grava o HTML bruto, sem extração estruturada. Sem
 * `waitForSelector` específico (a marcação da página de detalhe ainda não foi
 * diagnosticada) — captura o que o carregamento padrão do Playwright já trouxer; o
 * mesmo desafio Cloudflare do handler de listagem acima pode aparecer aqui também, com
 * o mesmo tratamento de sessão configurado no crawler (ver `main.ts`).
 */
export function createImovelwebDetalheRouter(
  capturaDataset: Dataset<RawCaptureItem>,
) {
  const router = createPlaywrightRouter();

  router.addDefaultHandler(async ({ page, request, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);

    await capturaDataset.pushData({
      origem: OrigemAnuncio.IMOVELWEB,
      tipoTransacao,
      tipoPagina: TipoPaginaCaptura.DETALHE,
      url: page.url(),
      formato: FormatoCaptura.HTML,
      conteudo: await page.content(),
      capturadoEm: new Date().toISOString(),
    });
    log.info(`Imovelweb: detalhe capturado em ${page.url()}`);
  });

  return router;
}
