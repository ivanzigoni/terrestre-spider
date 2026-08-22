import { createPlaywrightRouter, type Dataset } from 'crawlee';
import type { Page, Response } from 'playwright';

import type { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import type { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import type { RawListingItem } from '../../persistence/raw-listing-item.js';
import { getTransactionType } from './request-user-data.js';
import {
  IMOVIEW_PAGE_SIZE,
  type ImoviewCidade,
  parseSearchResponse,
} from './imoview-client.js';

/**
 * Router para o cluster Imoview em sites que rejeitam chamada manual (mesmo via
 * `page.evaluate`, com headers replicados) — confirmado no Liderar em
 * `discovery/imoview-diagnostico.md`. A única chamada que passa é a que a própria
 * página dispara nativamente ao carregar `?pagina=N` na URL. Este router não chama
 * `/retornar-imoveis-disponiveis` diretamente: navega para a URL com o parâmetro e
 * captura a resposta que o JavaScript nativo da página já dispara sozinho.
 */

const RESPONSE_TIMEOUT_MS = 20_000;

// Instalado via `preNavigationHooks` (roda antes do `page.goto` do Crawlee) — se
// esperássemos até o `requestHandler` normal, a navegação (e a chamada nativa que ela
// dispara) já teria terminado antes do listener existir.
export function waitForNativeSearchResponse(page: Page): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Nenhuma resposta de retornar-imoveis-disponiveis capturada em ${String(RESPONSE_TIMEOUT_MS / 1000)}s`,
        ),
      );
    }, RESPONSE_TIMEOUT_MS);

    page.once('response', function handler(response: Response) {
      if (!response.url().includes('retornar-imoveis-disponiveis')) {
        page.once('response', handler);
        return;
      }
      clearTimeout(timer);
      response
        .text()
        .then(resolve)
        .catch((error: unknown) => {
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  });
}

interface ImoviewBrowserUserData {
  cidade: ImoviewCidade;
  numeroPagina: number;
}

function getImoviewUserData(userData: unknown): ImoviewBrowserUserData {
  if (
    typeof userData !== 'object' ||
    userData === null ||
    !('cidade' in userData) ||
    typeof userData.cidade !== 'object' ||
    userData.cidade === null ||
    !('numeroPagina' in userData) ||
    typeof userData.numeroPagina !== 'number'
  ) {
    throw new Error(
      'cidade ou numeroPagina ausente/inválido no userData da request',
    );
  }
  const cidade = userData.cidade as Record<string, unknown>;
  if (typeof cidade.codigo !== 'number' || typeof cidade.nome !== 'string') {
    throw new Error('cidade ausente/inválida no userData da request');
  }
  return {
    cidade: { codigo: cidade.codigo, nome: cidade.nome },
    numeroPagina: userData.numeroPagina,
  };
}

/**
 * Monta a URL de listagem com `?pagina=N` — é essa URL, navegada por completo (não só
 * `history.pushState`), que faz a página buscar aquela página específica sozinha. O
 * valor do enum `TipoTransacao` já é literalmente `"venda"`/`"aluguel"`, o mesmo
 * segmento de path usado pelo cluster Imoview — sem precisar de mapeamento à parte.
 */
export function buildListingPageUrl(
  baseUrl: string,
  cidadeSlugAmigavel: string,
  transactionType: TipoTransacao,
  numeroPagina: number,
): string {
  return `${baseUrl}/${transactionType}/imovel/${cidadeSlugAmigavel}?pagina=${String(numeroPagina)}`;
}

export function createImoviewBrowserRouter(
  dataset: Dataset<RawListingItem>,
  baseUrl: string,
  origin: OrigemAnuncio,
  cidadeSlugAmigavel: string,
  pendingResponses: WeakMap<Page, Promise<string>>,
) {
  const router = createPlaywrightRouter();

  router.addDefaultHandler(async ({ page, request, addRequests, log }) => {
    const transactionType = getTransactionType(request.userData);
    const { cidade, numeroPagina } = getImoviewUserData(request.userData);

    const rawBody = await pendingResponses.get(page);
    if (rawBody === undefined) {
      throw new Error(
        'Nenhuma promise de resposta nativa registrada para esta página — preNavigationHooks não rodou.',
      );
    }

    const json: unknown = JSON.parse(rawBody);
    const { items, total } = parseSearchResponse(
      json,
      baseUrl,
      origin,
      transactionType,
    );

    if (items.length > 0) {
      await dataset.pushData(items);
    }
    log.info(
      `${origin}: ${String(items.length)} anúncio(s) na página ${String(numeroPagina)} (total=${String(total)}, via navegador)`,
    );

    const proximaPagina = numeroPagina + 1;
    if ((proximaPagina - 1) * IMOVIEW_PAGE_SIZE < total) {
      const nextUrl = buildListingPageUrl(
        baseUrl,
        cidadeSlugAmigavel,
        transactionType,
        proximaPagina,
      );
      await addRequests([
        {
          url: nextUrl,
          userData: { transactionType, cidade, numeroPagina: proximaPagina },
          uniqueKey: `${baseUrl}#transactionType=${transactionType}&pagina=${String(proximaPagina)}`,
        },
      ]);
    }
  });

  return router;
}
