import { createHttpRouter, type Dataset } from 'crawlee';

import type { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import type { RawListingItem } from '../../persistence/raw-listing-item.js';
import {
  IMOVIEW_PAGE_SIZE,
  type ImoviewCidade,
  buildSearchPayload,
  parseSearchResponse,
} from './imoview-client.js';
import { getTipoTransacao } from './request-user-data.js';

/**
 * Router único para o cluster Imoview inteiro — cada imobiliária só difere por `baseUrl` e
 * `origem`, então não há necessidade de um `routes.ts` por fonte (diferente das demais
 * fontes do projeto, cada uma com HTML/contrato próprio). Ver
 * `discovery/imoview-diagnostico.md` para a evidência de que o contrato é o mesmo.
 */

interface ImoviewUserData {
  cidade: ImoviewCidade;
  numeroPagina: number;
}

function getImoviewUserData(userData: unknown): ImoviewUserData {
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

export function createImoviewRouter(
  dataset: Dataset<RawListingItem>,
  baseUrl: string,
  origem: OrigemAnuncio,
) {
  const endpointUrl = `${baseUrl}/retornar-imoveis-disponiveis`;
  const router = createHttpRouter();

  router.addDefaultHandler(async ({ body, request, addRequests, log }) => {
    const tipoTransacao = getTipoTransacao(request.userData);
    const { cidade, numeroPagina } = getImoviewUserData(request.userData);

    // Parse manual em vez de `context.json` (tipado `any` por padrão) — mesma
    // disciplina do router do Quinto Andar (src/sources/quinto-andar/routes.ts).
    const rawBody = typeof body === 'string' ? body : body.toString('utf-8');
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
      `${origem}: ${String(items.length)} anúncio(s) na página ${String(numeroPagina)} (total=${String(total)})`,
    );

    const proximaPagina = numeroPagina + 1;
    if ((proximaPagina - 1) * IMOVIEW_PAGE_SIZE < total) {
      await addRequests([
        {
          url: endpointUrl,
          method: 'POST',
          payload: buildSearchPayload({
            cidade,
            tipoTransacao,
            numeroPagina: proximaPagina,
          }),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
          userData: { tipoTransacao, cidade, numeroPagina: proximaPagina },
          uniqueKey: `${endpointUrl}#tipoTransacao=${tipoTransacao}&pagina=${String(proximaPagina)}`,
        },
      ]);
    }
  });

  return router;
}
