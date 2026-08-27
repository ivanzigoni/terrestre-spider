import { createHttpRouter, type Dataset } from 'crawlee';

import { FormatoCaptura } from '../../persistence/enums/formato-captura.enum.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoPaginaCaptura } from '../../persistence/enums/tipo-pagina-captura.enum.js';
import type { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import type { LinkAnuncio } from '../../persistence/link-anuncio.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import { getTipoTransacao } from '../shared/request-user-data.js';
import {
  PAGE_SIZE,
  QUINTO_ANDAR_API_URL,
  businessContextFor,
  buildSearchRequestPayload,
  parseSearchListResponse,
} from './api-client.js';

interface QuintoAndarUserData {
  tipoTransacao: TipoTransacao;
  slug: string;
  offset: number;
}

/**
 * `slug`/`offset` viajam no `userData` junto com `tipoTransacao` — validados aqui em
 * runtime pelo mesmo motivo de `getTipoTransacao`: o dado vem desserializado da
 * RequestQueue, não é garantido pelo tipo estático.
 */
function getQuintoAndarUserData(userData: unknown): QuintoAndarUserData {
  const tipoTransacao = getTipoTransacao(userData);
  if (
    typeof userData !== 'object' ||
    userData === null ||
    !('slug' in userData) ||
    typeof userData.slug !== 'string' ||
    !('offset' in userData) ||
    typeof userData.offset !== 'number'
  ) {
    throw new Error('slug ou offset ausente/inválido no userData da request');
  }
  return { tipoTransacao, slug: userData.slug, offset: userData.offset };
}

export function createQuintoAndarRouter(
  dataset: Dataset<LinkAnuncio>,
  capturaDataset: Dataset<RawCaptureItem>,
) {
  const router = createHttpRouter();

  router.addDefaultHandler(async ({ body, request, addRequests, log }) => {
    const { tipoTransacao, slug, offset } = getQuintoAndarUserData(
      request.userData,
    );

    // Parse manual a partir de `body` (tipado `string | Buffer`, nunca `any`) em vez de
    // usar `context.json` (tipado `any` por padrão no HttpCrawler) — o payload é de uma
    // API de terceiro sem contrato formal, então tudo que chega passa por validação
    // manual (`parseSearchListResponse`) antes de virar tipo forte.
    const rawBody = typeof body === 'string' ? body : body.toString('utf-8');
    const json: unknown = JSON.parse(rawBody);

    await capturaDataset.pushData({
      origem: OrigemAnuncio.QUINTO_ANDAR,
      tipoTransacao,
      tipoPagina: TipoPaginaCaptura.LISTAGEM,
      url: request.url,
      formato: FormatoCaptura.JSON,
      conteudo: rawBody,
      capturadoEm: new Date().toISOString(),
    });

    const { items, total } = parseSearchListResponse(json, tipoTransacao);

    if (items.length > 0) {
      await dataset.pushData(items);
    }
    log.info(
      `Quinto Andar: ${String(items.length)} anúncio(s) em offset=${String(offset)} (total=${String(total)})`,
    );

    const nextOffset = offset + PAGE_SIZE;
    if (nextOffset < total) {
      const businessContext = businessContextFor(tipoTransacao);
      await addRequests([
        {
          url: QUINTO_ANDAR_API_URL,
          method: 'POST',
          payload: buildSearchRequestPayload({
            slug,
            businessContext,
            offset: nextOffset,
          }),
          headers: { 'Content-Type': 'application/json' },
          userData: { tipoTransacao, slug, offset: nextOffset },
          uniqueKey: `${QUINTO_ANDAR_API_URL}#slug=${slug}&businessContext=${businessContext}&offset=${String(nextOffset)}`,
        },
      ]);
    }
  });

  return router;
}

/**
 * Router da fase de detalhe — visita a página do próprio anúncio (o `link` já extraído
 * pelo router de listagem acima). Diferente da listagem (API JSON), a página de detalhe
 * de qualquer imóvel é HTML normal renderizado no servidor — grava o corpo bruto sem
 * extração estruturada.
 */
export function createQuintoAndarDetalheRouter(
  capturaDataset: Dataset<RawCaptureItem>,
) {
  const router = createHttpRouter();

  router.addDefaultHandler(async ({ body, request, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);
    const rawBody = typeof body === 'string' ? body : body.toString('utf-8');

    await capturaDataset.pushData({
      origem: OrigemAnuncio.QUINTO_ANDAR,
      tipoTransacao,
      tipoPagina: TipoPaginaCaptura.DETALHE,
      url: request.url,
      formato: FormatoCaptura.HTML,
      conteudo: rawBody,
      capturadoEm: new Date().toISOString(),
    });
    log.info(`Quinto Andar: detalhe capturado em ${request.url}`);
  });

  return router;
}
