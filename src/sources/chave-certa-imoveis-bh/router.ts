import { createHttpRouter, type Dataset } from 'crawlee';

import { FormatoCaptura } from '../../persistence/enums/formato-captura.enum.js';
import type { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoPaginaCaptura } from '../../persistence/enums/tipo-pagina-captura.enum.js';
import type { LinkAnuncio } from '../../persistence/link-anuncio.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import { getTipoTransacao } from '../shared/request-user-data.js';
import {
  buildRequestHeaders,
  buildSearchUrl,
  parseSearchResponse,
} from './client.js';

/**
 * Router de Chave Certa Imóveis BH (plataforma Tecimob, ver `client.js`). Diferente do
 * Kenlo/Imoview, o endpoint não separa venda/aluguel por parâmetro de busca — é uma
 * única listagem paginada, e cada item já vem com sua própria `transaction`. Por isso um
 * único crawler percorre todas as páginas, sem um crawler por tipo de transação.
 */

interface TecimobUserData {
  numeroPagina: number;
}

function getTecimobUserData(userData: unknown): TecimobUserData {
  if (
    typeof userData !== 'object' ||
    userData === null ||
    !('numeroPagina' in userData) ||
    typeof userData.numeroPagina !== 'number'
  ) {
    throw new Error('numeroPagina ausente/inválido no userData da request');
  }
  return { numeroPagina: userData.numeroPagina };
}

export function createChaveCertaRouter(
  dataset: Dataset<LinkAnuncio>,
  capturaDataset: Dataset<RawCaptureItem>,
  baseUrl: string,
  origem: OrigemAnuncio,
) {
  const router = createHttpRouter();

  router.addDefaultHandler(async ({ body, request, addRequests, log }) => {
    const { numeroPagina } = getTecimobUserData(request.userData);

    const rawBody = typeof body === 'string' ? body : body.toString('utf-8');
    const json: unknown = JSON.parse(rawBody);

    await capturaDataset.pushData({
      origem,
      tipoTransacao: null,
      tipoPagina: TipoPaginaCaptura.LISTAGEM,
      url: request.url,
      formato: FormatoCaptura.JSON,
      conteudo: rawBody,
      capturadoEm: new Date().toISOString(),
    });

    const { items, totalPages } = parseSearchResponse(json, baseUrl);

    if (items.length > 0) {
      await dataset.pushData(items);
    }
    log.info(
      `${origem}: ${String(items.length)} anúncio(s) na página ${String(numeroPagina)} (de ${String(totalPages)})`,
    );

    const proximaPagina = numeroPagina + 1;
    if (proximaPagina <= totalPages) {
      await addRequests([
        {
          url: buildSearchUrl(proximaPagina),
          headers: buildRequestHeaders(),
          userData: { numeroPagina: proximaPagina },
          uniqueKey: `${baseUrl}#pagina=${String(proximaPagina)}`,
        },
      ]);
    }
  });

  return router;
}

/**
 * Fase de detalhe — página do próprio anúncio, renderizada no servidor (Next.js SSR,
 * confirmado no diagnóstico: preço real presente no HTML cru) — grava o corpo bruto sem
 * extração estruturada, mesmo padrão do Kenlo.
 */
export function createChaveCertaDetalheRouter(
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
