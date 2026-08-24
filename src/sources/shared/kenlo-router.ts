import { createHttpRouter, type Dataset } from 'crawlee';

import { FormatoCaptura } from '../../persistence/enums/formato-captura.enum.js';
import type { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoPaginaCaptura } from '../../persistence/enums/tipo-pagina-captura.enum.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import type { RawListingItem } from '../../persistence/raw-listing-item.js';
import {
  buildSearchUrl,
  KENLO_PAGE_SIZE,
  parseSearchResponse,
} from './kenlo-client.js';
import { getTipoTransacao } from './request-user-data.js';

/**
 * Router único para o cluster Kenlo inteiro — cada imobiliária só difere por `baseUrl` e
 * `origem`, mesmo raciocínio de reaproveito do cluster Imoview (`imoview-router.ts`). Ver
 * `discovery/independentes-diagnostico.md` (Achado 2) e lote 2 de
 * `.claude/__workdir/integracao-lote/lotes.md` para a evidência de que o contrato é o
 * mesmo entre JMC e Luxus.
 */

interface KenloUserData {
  cidadeSlug: string;
  numeroPagina: number;
}

function getKenloUserData(userData: unknown): KenloUserData {
  if (
    typeof userData !== 'object' ||
    userData === null ||
    !('cidadeSlug' in userData) ||
    typeof userData.cidadeSlug !== 'string' ||
    !('numeroPagina' in userData) ||
    typeof userData.numeroPagina !== 'number'
  ) {
    throw new Error(
      'cidadeSlug ou numeroPagina ausente/inválido no userData da request',
    );
  }
  return {
    cidadeSlug: userData.cidadeSlug,
    numeroPagina: userData.numeroPagina,
  };
}

export function createKenloRouter(
  dataset: Dataset<RawListingItem>,
  capturaDataset: Dataset<RawCaptureItem>,
  baseUrl: string,
  origem: OrigemAnuncio,
) {
  const router = createHttpRouter();

  router.addDefaultHandler(async ({ body, request, addRequests, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);
    const { cidadeSlug, numeroPagina } = getKenloUserData(request.userData);

    // Parse manual em vez de `context.json` (tipado `any` por padrão) — mesma
    // disciplina do router do Imoview/Quinto Andar.
    const rawBody = typeof body === 'string' ? body : body.toString('utf-8');
    const json: unknown = JSON.parse(rawBody);

    await capturaDataset.pushData({
      origem,
      tipoTransacao,
      tipoPagina: TipoPaginaCaptura.LISTAGEM,
      url: request.url,
      formato: FormatoCaptura.JSON,
      conteudo: rawBody,
      capturadoEm: new Date().toISOString(),
    });

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
      `${origem}: ${String(items.length)} anúncio(s) na página ${String(numeroPagina)} (total=${String(total)})`,
    );

    const proximaPagina = numeroPagina + 1;
    if (numeroPagina * KENLO_PAGE_SIZE < total) {
      const proximaUrl = buildSearchUrl(baseUrl, {
        tipoTransacao,
        numeroPagina: proximaPagina,
        cidadeSlug,
      });
      await addRequests([
        {
          url: proximaUrl,
          userData: { tipoTransacao, cidadeSlug, numeroPagina: proximaPagina },
          uniqueKey: `${baseUrl}#tipoTransacao=${tipoTransacao}&pagina=${String(proximaPagina)}`,
        },
      ]);
    }
  });

  return router;
}

/**
 * Router da fase de detalhe, compartilhado pelo cluster Kenlo igual ao de listagem acima
 * — visita a página do próprio anúncio (o `link` já extraído na listagem). Diferente da
 * listagem (API JSON via `/api/listings/...`), a página de detalhe é HTML normal
 * renderizado no servidor — grava o corpo bruto sem extração estruturada.
 */
export function createKenloDetalheRouter(
  capturaDataset: Dataset<RawCaptureItem>,
  origem: OrigemAnuncio,
) {
  const router = createHttpRouter();

  router.addDefaultHandler(async ({ body, request, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);
    const rawBody = typeof body === 'string' ? body : body.toString('utf-8');

    await capturaDataset.pushData({
      origem,
      tipoTransacao,
      tipoPagina: TipoPaginaCaptura.DETALHE,
      url: request.url,
      formato: FormatoCaptura.HTML,
      conteudo: rawBody,
      capturadoEm: new Date().toISOString(),
    });
    log.info(`${origem}: detalhe capturado em ${request.url}`);
  });

  return router;
}
