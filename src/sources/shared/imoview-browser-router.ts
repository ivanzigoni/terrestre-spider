import { createPlaywrightRouter, type Dataset } from 'crawlee';
import type { Page, Response } from 'playwright';

import { FormatoCaptura } from '../../persistence/enums/formato-captura.enum.js';
import type { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoPaginaCaptura } from '../../persistence/enums/tipo-pagina-captura.enum.js';
import type { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import type { RawListingItem } from '../../persistence/raw-listing-item.js';
import { getTipoTransacao } from './request-user-data.js';
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
  tipoTransacao: TipoTransacao,
  numeroPagina: number,
): string {
  return `${baseUrl}/${tipoTransacao}/imovel/${cidadeSlugAmigavel}?pagina=${String(numeroPagina)}`;
}

export function createImoviewBrowserRouter(
  dataset: Dataset<RawListingItem>,
  capturaDataset: Dataset<RawCaptureItem>,
  baseUrl: string,
  origem: OrigemAnuncio,
  cidadeSlugAmigavel: string,
  pendingResponses: WeakMap<Page, Promise<string>>,
) {
  const router = createPlaywrightRouter();

  router.addDefaultHandler(async ({ page, request, addRequests, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);
    const { cidade, numeroPagina } = getImoviewUserData(request.userData);

    const rawBody = await pendingResponses.get(page);
    if (rawBody === undefined) {
      throw new Error(
        'Nenhuma promise de resposta nativa registrada para esta página — preNavigationHooks não rodou.',
      );
    }

    // Captura o JSON de verdade (a resposta de rede nativa), não `page.content()` — o
    // HTML da página é só a casca, o dado real é a resposta interceptada acima.
    await capturaDataset.pushData({
      origem,
      tipoTransacao,
      tipoPagina: TipoPaginaCaptura.LISTAGEM,
      url: page.url(),
      formato: FormatoCaptura.JSON,
      conteudo: rawBody,
      capturadoEm: new Date().toISOString(),
    });

    const json: unknown = JSON.parse(rawBody);
    const { items, total } = parseSearchResponse(
      json,
      baseUrl,
      origem,
      tipoTransacao,
    );

    if (items.length > 0) {
      await dataset.pushData(items);
    }
    log.info(
      `${origem}: ${String(items.length)} anúncio(s) na página ${String(numeroPagina)} (total=${String(total)}, via navegador)`,
    );

    const proximaPagina = numeroPagina + 1;
    if ((proximaPagina - 1) * IMOVIEW_PAGE_SIZE < total) {
      const nextUrl = buildListingPageUrl(
        baseUrl,
        cidadeSlugAmigavel,
        tipoTransacao,
        proximaPagina,
      );
      await addRequests([
        {
          url: nextUrl,
          userData: { tipoTransacao, cidade, numeroPagina: proximaPagina },
          uniqueKey: `${baseUrl}#tipoTransacao=${tipoTransacao}&pagina=${String(proximaPagina)}`,
        },
      ]);
    }
  });

  return router;
}

/**
 * Router da fase de detalhe, compartilhado pelo cluster Imoview-navegador igual ao de
 * listagem acima — visita a página do próprio anúncio (o `link` já extraído na
 * listagem). Diferente do router de listagem, não precisa da dança de interceptar
 * resposta nativa (`waitForNativeSearchResponse`): a página de detalhe é carregada e
 * capturada normalmente via `page.content()`, sem chamada de API embutida a interceptar.
 */
export function createImoviewBrowserDetalheRouter(
  capturaDataset: Dataset<RawCaptureItem>,
  origem: OrigemAnuncio,
) {
  const router = createPlaywrightRouter();

  router.addDefaultHandler(async ({ page, request, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);

    await capturaDataset.pushData({
      origem,
      tipoTransacao,
      tipoPagina: TipoPaginaCaptura.DETALHE,
      url: page.url(),
      formato: FormatoCaptura.HTML,
      conteudo: await page.content(),
      capturadoEm: new Date().toISOString(),
    });
    log.info(`${origem}: detalhe capturado em ${page.url()}`);
  });

  return router;
}
