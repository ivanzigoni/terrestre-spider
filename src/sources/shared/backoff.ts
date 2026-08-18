const BACKOFF_STATUS_CODES = new Set([429, 503]);

/**
 * Espera inicial e teto do backoff exponencial. O Crawlee, por padrão, reenfileira uma
 * request que falhou até `maxRequestRetries` vezes (3) sem nenhuma espera crescente entre
 * tentativas — só o `sameDomainDelaySecs` normal se aplica. Isso é retry imediato, não
 * backoff, e é exatamente o que a skill terrestre__scraping-responsavel pede pra evitar em
 * 429/503: um site que já sinalizou rate limit não deveria ser tentado de novo no mesmo
 * ritmo, só com espera crescente.
 */
export const BASE_BACKOFF_MS = 2_000;
export const MAX_BACKOFF_MS = 60_000;

type SleepFn = (ms: number) => Promise<void>;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Formato mínimo comum entre `CheerioCrawlingContext`, `HttpCrawlingContext` e
 * `PlaywrightCrawlingContext` — evita importar os três tipos específicos do Crawlee só
 * para aceitar qualquer um deles neste helper compartilhado pelas 5 fontes.
 */
interface BackoffContext {
  request: { retryCount: number };
  response?: unknown;
  log: { warning: (message: string) => void };
}

/**
 * `response` chega em dois formatos diferentes dependendo da engine: CheerioCrawler e
 * HttpCrawler expõem `statusCode` como propriedade numérica (resposta do got-scraping);
 * PlaywrightCrawler expõe `status()` como método do `Response` do Playwright. Sem isso,
 * o status do 429/503 não teria como ser lido de forma genérica pelas 5 fontes.
 */
function extractStatusCode(response: unknown): number | null {
  if (typeof response !== 'object' || response === null) {
    return null;
  }
  const candidate = response as { statusCode?: unknown; status?: unknown };
  if (typeof candidate.statusCode === 'number') {
    return candidate.statusCode;
  }
  if (typeof candidate.status === 'function') {
    const result = (candidate.status as () => unknown)();
    return typeof result === 'number' ? result : null;
  }
  return null;
}

/**
 * Backoff exponencial em 429/503, para usar como `errorHandler` do Crawlee. O Crawlee
 * chama `errorHandler(context, error)` e aguarda o retorno antes de reenfileirar a
 * request — um `await` aqui dentro atrasa de fato a próxima tentativa, mesmo sem o
 * Crawlee ter suporte nativo a backoff (verificado em
 * `@crawlee/basic/internals/basic-crawler.js`: `errorHandler` roda antes de
 * `request.retryCount++` e do reclaim, sem nenhuma espera própria).
 *
 * Outros erros (parsing, timeout, DNS) não passam por aqui parados: sem status 429/503
 * reconhecido, a função retorna sem esperar, e o retry padrão do Crawlee segue normal.
 */
export async function backoffOnRateLimit(
  context: BackoffContext,
  sleepFn: SleepFn = defaultSleep,
): Promise<void> {
  const statusCode = extractStatusCode(context.response);
  if (statusCode === null || !BACKOFF_STATUS_CODES.has(statusCode)) {
    return;
  }

  const attempt = context.request.retryCount;
  const backoffMs = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);

  context.log.warning(
    `Status ${String(statusCode)} recebido; aguardando ${String(backoffMs)}ms antes da próxima tentativa (tentativa ${String(attempt + 1)}).`,
  );

  await sleepFn(backoffMs);
}
