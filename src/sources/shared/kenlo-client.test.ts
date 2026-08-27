import { describe, expect, it } from 'vitest';

import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import { parseSearchResponse } from './kenlo-client.js';

const BASE_URL = 'https://www.exemplo-kenlo.com.br';

function buildRawItem(url: string): unknown {
  return { url };
}

describe('parseSearchResponse', () => {
  it('monta o link do anúncio a partir de url', () => {
    const { items, total } = parseSearchResponse(
      {
        data: [buildRawItem('/imoveis/apartamento-savassi-123')],
        count: 1,
      },
      BASE_URL,
      TipoTransacao.VENDA,
    );

    expect(total).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      link: `${BASE_URL}/imoveis/apartamento-savassi-123`,
      tipoTransacao: TipoTransacao.VENDA,
    });
  });

  it('descarta item sem url, sem lançar erro', () => {
    const { items, total } = parseSearchResponse(
      {
        data: [{ codigo: 1 }, buildRawItem('/imoveis/imovel-valido')],
        count: 2,
      },
      BASE_URL,
      TipoTransacao.ALUGUEL,
    );

    expect(total).toBe(2);
    expect(items).toHaveLength(1);
    expect(items[0]?.link).toBe(`${BASE_URL}/imoveis/imovel-valido`);
  });

  it('lança erro para uma resposta em formato inesperado', () => {
    expect(() =>
      parseSearchResponse({ nada: 'a ver' }, BASE_URL, TipoTransacao.VENDA),
    ).toThrow();
  });
});
