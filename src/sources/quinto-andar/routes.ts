import { createHttpRouter, type Dataset } from 'crawlee';

import type { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import type { RawListingItem } from '../../persistence/raw-listing-item.js';
import { getTransactionType } from '../shared/request-user-data.js';
import {
  PAGE_SIZE,
  QUINTO_ANDAR_API_URL,
  businessContextFor,
  buildSearchRequestPayload,
  parseSearchListResponse,
} from './api-client.js';

interface QuintoAndarUserData {
  transactionType: TipoTransacao;
  slug: string;
  offset: number;
}

/**
 * `slug`/`offset` viajam no `userData` junto com `transactionType` — validados aqui em
 * runtime pelo mesmo motivo de `getTransactionType`: o dado vem desserializado da
 * RequestQueue, não é garantido pelo tipo estático.
 */
function getQuintoAndarUserData(userData: unknown): QuintoAndarUserData {
  const transactionType = getTransactionType(userData);
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
  return { transactionType, slug: userData.slug, offset: userData.offset };
}

export function createQuintoAndarRouter(dataset: Dataset<RawListingItem>) {
  const router = createHttpRouter();

  router.addDefaultHandler(async ({ body, request, addRequests, log }) => {
    const { transactionType, slug, offset } = getQuintoAndarUserData(
      request.userData,
    );

    // Parse manual a partir de `body` (tipado `string | Buffer`, nunca `any`) em vez de
    // usar `context.json` (tipado `any` por padrão no HttpCrawler) — o payload é de uma
    // API de terceiro sem contrato formal, então tudo que chega passa por validação
    // manual (`parseSearchListResponse`) antes de virar tipo forte.
    const rawBody = typeof body === 'string' ? body : body.toString('utf-8');
    const json: unknown = JSON.parse(rawBody);

    const { items, total } = parseSearchListResponse(json, transactionType);

    if (items.length > 0) {
      await dataset.pushData(items);
    }
    log.info(
      `Quinto Andar: ${String(items.length)} anúncio(s) em offset=${String(offset)} (total=${String(total)})`,
    );

    const nextOffset = offset + PAGE_SIZE;
    if (nextOffset < total) {
      const businessContext = businessContextFor(transactionType);
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
          userData: { transactionType, slug, offset: nextOffset },
          uniqueKey: `${QUINTO_ANDAR_API_URL}#slug=${slug}&businessContext=${businessContext}&offset=${String(nextOffset)}`,
        },
      ]);
    }
  });

  return router;
}
