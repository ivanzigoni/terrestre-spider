import { createCheerioRouter, type Dataset } from 'crawlee';

import { FormatoCaptura } from '../../persistence/enums/formato-captura.enum.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoPaginaCaptura } from '../../persistence/enums/tipo-pagina-captura.enum.js';
import type { LinkAnuncio } from '../../persistence/link-anuncio.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import { getTipoTransacao } from '../shared/request-user-data.js';

/**
 * Casa Mineira (`.claude/__workdir/integracao-lote/lotes.md`, investigação de
 * 29-08-2026) — portal regional do Grupo QuintoAndar rodando sobre a plataforma Navent
 * (CDN `naventcdn.com`, endpoints `rp-api`/`rplis-api`/`rpfic-api`), mesmo porte dos
 * portais grandes já integrados (OLX/ZAP/Viva Real/Imovelweb). Sem anti-bot real — o
 * bloqueio visto contra `curl` puro é simples checagem de fingerprint TLS/HTTP,
 * contornado pelo `ImpitHttpClient` já usado nos outros portais (confirmado ao vivo:
 * listagem e detalhe respondem 200 com conteúdo real via HTTP puro, sem navegador).
 *
 * Paginação: os links "1", "2", "3"... na página têm todos o MESMO `href` (a navegação
 * de verdade é via clique/JS, roteamento client-side) — só o atributo `data-qa` do link
 * ("PAGING_2", "PAGING_3"...) distingue a página. Não dá pra "seguir o link", como o
 * `olx/routes.ts` faz; a URL da próxima página é construída manualmente
 * (`<url-de-busca>/pagina-N`, confirmado navegando de verdade via clique no site).
 * Página 1 não tem sufixo.
 *
 * Cards de listagem também não são `<a href>` — são `<div data-to-posting="/imovel/...">`
 * com roteamento client-side; o link do anúncio vem desse atributo.
 */

const CARD_SELECTOR = '[data-to-posting]';

function buildPageUrl(searchUrl: string, numeroPagina: number): string {
  return numeroPagina <= 1
    ? searchUrl
    : `${searchUrl}/pagina-${String(numeroPagina)}`;
}

interface CasaMineiraUserData {
  searchUrl: string;
  numeroPagina: number;
}

function getCasaMineiraUserData(userData: unknown): CasaMineiraUserData {
  if (
    typeof userData !== 'object' ||
    userData === null ||
    !('searchUrl' in userData) ||
    typeof userData.searchUrl !== 'string' ||
    !('numeroPagina' in userData) ||
    typeof userData.numeroPagina !== 'number'
  ) {
    throw new Error(
      'searchUrl ou numeroPagina ausente/inválido no userData da request',
    );
  }
  return { searchUrl: userData.searchUrl, numeroPagina: userData.numeroPagina };
}

export function createCasaMineiraRouter(
  dataset: Dataset<LinkAnuncio>,
  capturaDataset: Dataset<RawCaptureItem>,
) {
  const router = createCheerioRouter();

  router.addDefaultHandler(async ({ $, request, addRequests, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);
    const { searchUrl, numeroPagina } = getCasaMineiraUserData(
      request.userData,
    );

    // Captura bruta incondicional, antes do parsing dos cards — mesmo padrão do OLX.
    await capturaDataset.pushData({
      origem: OrigemAnuncio.CASA_MINEIRA,
      tipoTransacao,
      tipoPagina: TipoPaginaCaptura.LISTAGEM,
      url: request.loadedUrl,
      formato: FormatoCaptura.HTML,
      conteudo: $.html(),
      capturadoEm: new Date().toISOString(),
    });

    const items: LinkAnuncio[] = [];
    $(CARD_SELECTOR).each((_, card) => {
      const href = $(card).attr('data-to-posting');
      if (href === undefined) return;
      const link = new URL(href, request.loadedUrl).toString();
      items.push({ link, tipoTransacao });
    });

    if (items.length > 0) {
      await dataset.pushData(items);
    }
    log.info(
      `Casa Mineira: ${String(items.length)} anúncio(s) na página ${String(numeroPagina)} de ${request.loadedUrl}`,
    );

    // Sem página com 0 cards = fim da paginação — mesmo raciocínio de "captura sempre,
    // pare quando não há mais nada" do OLX, sem depender do total exato do H1 nem da
    // janela de 5 números visível nos controles de paginação.
    if (items.length > 0) {
      const proximaPagina = numeroPagina + 1;
      await addRequests([
        {
          url: buildPageUrl(searchUrl, proximaPagina),
          userData: { tipoTransacao, searchUrl, numeroPagina: proximaPagina },
          uniqueKey: `${searchUrl}#pagina=${String(proximaPagina)}`,
        },
      ]);
    }
  });

  return router;
}

/**
 * Fase de detalhe — mesmo padrão do OLX: grava o HTML bruto, sem extração estruturada.
 */
export function createCasaMineiraDetalheRouter(
  capturaDataset: Dataset<RawCaptureItem>,
) {
  const router = createCheerioRouter();

  router.addDefaultHandler(async ({ $, request, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);

    await capturaDataset.pushData({
      origem: OrigemAnuncio.CASA_MINEIRA,
      tipoTransacao,
      tipoPagina: TipoPaginaCaptura.DETALHE,
      url: request.loadedUrl,
      formato: FormatoCaptura.HTML,
      conteudo: $.html(),
      capturadoEm: new Date().toISOString(),
    });
    log.info(`Casa Mineira: detalhe capturado em ${request.loadedUrl}`);
  });

  return router;
}
