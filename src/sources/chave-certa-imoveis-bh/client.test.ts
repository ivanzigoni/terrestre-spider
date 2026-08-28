import { describe, expect, it } from 'vitest';

import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import { parseSearchResponse } from './client.js';

const BASE_URL = 'https://chavecertaimoveisbh.com.br';

describe('parseSearchResponse', () => {
  it('extrai link e tipoTransacao dos itens válidos', () => {
    const json = {
      data: [
        {
          url: 'apartamento-a-venda-no-bairro-araguaia-em-belo-horizonte-mg/716',
          transaction: 'VENDA',
        },
      ],
      meta: { pagination: { total_pages: 5 } },
    };
    const { items, totalPages } = parseSearchResponse(json, BASE_URL);
    expect(items).toEqual([
      {
        link: `${BASE_URL}/imovel/apartamento-a-venda-no-bairro-araguaia-em-belo-horizonte-mg/716`,
        tipoTransacao: TipoTransacao.VENDA,
      },
    ]);
    expect(totalPages).toBe(5);
  });

  it('reconhece ALUGUEL', () => {
    const json = {
      data: [{ url: 'casa-para-alugar/1', transaction: 'ALUGUEL' }],
      meta: { pagination: { total_pages: 1 } },
    };
    const { items } = parseSearchResponse(json, BASE_URL);
    expect(items[0]?.tipoTransacao).toBe(TipoTransacao.ALUGUEL);
  });

  it('descarta item sem url, sem lançar', () => {
    const json = {
      data: [{ transaction: 'VENDA' }],
      meta: { pagination: { total_pages: 1 } },
    };
    expect(parseSearchResponse(json, BASE_URL).items).toEqual([]);
  });

  it('descarta item com transaction desconhecida, sem lançar', () => {
    const json = {
      data: [{ url: 'imovel/1', transaction: 'LANCAMENTO' }],
      meta: { pagination: { total_pages: 1 } },
    };
    expect(parseSearchResponse(json, BASE_URL).items).toEqual([]);
  });

  it('lança em formato de resposta inesperado', () => {
    expect(() => parseSearchResponse({ foo: 'bar' }, BASE_URL)).toThrow();
  });
});
