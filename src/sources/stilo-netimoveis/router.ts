import { createHttpRouter, type Dataset } from 'crawlee';

import { FormatoCaptura } from '../../persistence/enums/formato-captura.enum.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoPaginaCaptura } from '../../persistence/enums/tipo-pagina-captura.enum.js';
import type { LinkAnuncio } from '../../persistence/link-anuncio.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import { getTipoTransacao } from '../shared/request-user-data.js';
import {
  buildSearchUrl,
  parseSearchResponse,
  type StiloTransacaoParam,
} from './client.js';

/**
 * Router de Stilo Netimóveis (ver `client.ts`) — mesmo raciocínio de paginação do
 * OLX/Casa Mineira: sem confiar em `totalDeRegistros` (contagem da rede SAN, não
 * necessariamente exata pro filtro aplicado), para quando uma página devolve 0 itens.
 */

interface StiloUserData {
  transacaoParam: StiloTransacaoParam;
  numeroPagina: number;
}

function getStiloUserData(userData: unknown): StiloUserData {
  if (
    typeof userData !== 'object' ||
    userData === null ||
    !('transacaoParam' in userData) ||
    typeof userData.transacaoParam !== 'string' ||
    !('numeroPagina' in userData) ||
    typeof userData.numeroPagina !== 'number'
  ) {
    throw new Error(
      'transacaoParam ou numeroPagina ausente/inválido no userData da request',
    );
  }
  return {
    transacaoParam: userData.transacaoParam as StiloTransacaoParam,
    numeroPagina: userData.numeroPagina,
  };
}

export function createStiloNetimoveisRouter(
  dataset: Dataset<LinkAnuncio>,
  capturaDataset: Dataset<RawCaptureItem>,
) {
  const router = createHttpRouter();

  router.addDefaultHandler(async ({ body, request, addRequests, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);
    const { transacaoParam, numeroPagina } = getStiloUserData(request.userData);

    const rawBody = typeof body === 'string' ? body : body.toString('utf-8');
    const json: unknown = JSON.parse(rawBody);

    await capturaDataset.pushData({
      origem: OrigemAnuncio.STILO_NETIMOVEIS,
      tipoTransacao,
      tipoPagina: TipoPaginaCaptura.LISTAGEM,
      url: request.url,
      formato: FormatoCaptura.JSON,
      conteudo: rawBody,
      capturadoEm: new Date().toISOString(),
    });

    const links = parseSearchResponse(json);
    if (links.length > 0) {
      await dataset.pushData(links.map((link) => ({ link, tipoTransacao })));
    }
    log.info(
      `Stilo Netimóveis: ${String(links.length)} anúncio(s) na página ${String(numeroPagina)} (${transacaoParam})`,
    );

    if (links.length > 0) {
      const proximaPagina = numeroPagina + 1;
      await addRequests([
        {
          url: buildSearchUrl(transacaoParam, proximaPagina),
          userData: {
            tipoTransacao,
            transacaoParam,
            numeroPagina: proximaPagina,
          },
          uniqueKey: `stilo-${transacaoParam}#pagina=${String(proximaPagina)}`,
        },
      ]);
    }
  });

  return router;
}

/**
 * Fase de detalhe — página do anúncio, 100% renderizada no servidor (confirmado no
 * diagnóstico: preço presente no HTML cru) — grava o corpo bruto sem extração
 * estruturada, mesmo padrão do Chave Certa/GSA Ativos.
 */
export function createStiloNetimoveisDetalheRouter(
  capturaDataset: Dataset<RawCaptureItem>,
) {
  const router = createHttpRouter();

  router.addDefaultHandler(async ({ body, request, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);
    const rawBody = typeof body === 'string' ? body : body.toString('utf-8');

    await capturaDataset.pushData({
      origem: OrigemAnuncio.STILO_NETIMOVEIS,
      tipoTransacao,
      tipoPagina: TipoPaginaCaptura.DETALHE,
      url: request.url,
      formato: FormatoCaptura.HTML,
      conteudo: rawBody,
      capturadoEm: new Date().toISOString(),
    });
    log.info(`Stilo Netimóveis: detalhe capturado em ${request.url}`);
  });

  return router;
}
