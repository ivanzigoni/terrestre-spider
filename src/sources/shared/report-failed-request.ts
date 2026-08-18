import * as Sentry from '@sentry/node';

import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';

/**
 * Formato mínimo comum entre `CheerioCrawlingContext`, `HttpCrawlingContext` e
 * `PlaywrightCrawlingContext` — mesmo raciocínio de `BackoffContext` em `backoff.ts`:
 * evita importar os três tipos específicos do Crawlee só para aceitar qualquer um deles
 * neste helper compartilhado pelas 5 fontes.
 */
interface FailedRequestContext {
  request: { url: string };
  log: {
    error: (message: string, data?: Record<string, unknown> | null) => void;
  };
}

/**
 * Usado como `failedRequestHandler` do Crawlee: chamado quando uma request esgotou todas
 * as tentativas de retry. Sem isso, hoje essas requests desaparecem sem log nenhum — nem
 * o `errorHandler` (`backoffOnRateLimit`) nem nenhum outro ponto do código captura esse
 * caso, já que nenhuma das 5 fontes configura `failedRequestHandler`.
 */
export function reportFailedRequest(
  origem: OrigemAnuncio,
  context: FailedRequestContext,
  error: Error,
): void {
  context.log.error(`request falhou definitivamente (${origem})`, {
    url: context.request.url,
    error,
  });
  Sentry.captureException(error, {
    tags: { fonte: origem },
    extra: { url: context.request.url },
  });
}
