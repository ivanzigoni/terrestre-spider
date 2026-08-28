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
  type MyBrokerUserIntent,
} from './client.js';

/**
 * Router de My Broker Belo Horizonte (ver `client.ts`) — mesmo raciocínio de paginação
 * do Stilo Netimóveis/OLX/Casa Mineira: para quando uma página devolve 0 itens. Uma
 * página bem além do fim (testado ao vivo) devolve HTTP 500 do backend deles, não um
 * 404/lista vazia — por isso o crawler nunca deve pular páginas, só incrementar 1 a 1.
 */

interface MyBrokerUserData {
  userIntent: MyBrokerUserIntent;
  numeroPagina: number;
}

function getMyBrokerUserData(userData: unknown): MyBrokerUserData {
  if (
    typeof userData !== 'object' ||
    userData === null ||
    !('userIntent' in userData) ||
    typeof userData.userIntent !== 'string' ||
    !('numeroPagina' in userData) ||
    typeof userData.numeroPagina !== 'number'
  ) {
    throw new Error(
      'userIntent ou numeroPagina ausente/inválido no userData da request',
    );
  }
  return {
    userIntent: userData.userIntent as MyBrokerUserIntent,
    numeroPagina: userData.numeroPagina,
  };
}

export function createMyBrokerRouter(
  dataset: Dataset<LinkAnuncio>,
  capturaDataset: Dataset<RawCaptureItem>,
) {
  const router = createHttpRouter();

  router.addDefaultHandler(async ({ body, request, addRequests, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);
    const { userIntent, numeroPagina } = getMyBrokerUserData(request.userData);

    const rawBody = typeof body === 'string' ? body : body.toString('utf-8');
    const json: unknown = JSON.parse(rawBody);

    await capturaDataset.pushData({
      origem: OrigemAnuncio.MY_BROKER_BELO_HORIZONTE,
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
      `My Broker Belo Horizonte: ${String(links.length)} anúncio(s) na página ${String(numeroPagina)} (${userIntent})`,
    );

    if (links.length > 0) {
      const proximaPagina = numeroPagina + 1;
      await addRequests([
        {
          url: buildSearchUrl(userIntent, proximaPagina),
          userData: { tipoTransacao, userIntent, numeroPagina: proximaPagina },
          uniqueKey: `my-broker-bh-${userIntent}#pagina=${String(proximaPagina)}`,
        },
      ]);
    }
  });

  return router;
}

/**
 * Fase de detalhe — página do anúncio, 100% renderizada no servidor (confirmado no
 * diagnóstico) — grava o corpo bruto sem extração estruturada, mesmo padrão do Stilo
 * Netimóveis/Chave Certa.
 */
export function createMyBrokerDetalheRouter(
  capturaDataset: Dataset<RawCaptureItem>,
) {
  const router = createHttpRouter();

  router.addDefaultHandler(async ({ body, request, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);
    const rawBody = typeof body === 'string' ? body : body.toString('utf-8');

    await capturaDataset.pushData({
      origem: OrigemAnuncio.MY_BROKER_BELO_HORIZONTE,
      tipoTransacao,
      tipoPagina: TipoPaginaCaptura.DETALHE,
      url: request.url,
      formato: FormatoCaptura.HTML,
      conteudo: rawBody,
      capturadoEm: new Date().toISOString(),
    });
    log.info(`My Broker Belo Horizonte: detalhe capturado em ${request.url}`);
  });

  return router;
}
