import { describe, expect, it } from 'vitest';

import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import { parseSearchResponse } from './imoview-client.js';

const BASE_URL = 'https://www.exemplo-imoview.com.br';

function buildRawItem(codigo: number, urlAmigavel: string): unknown {
  return { codigo, url_amigavel: urlAmigavel };
}

describe('parseSearchResponse', () => {
  it('monta o link do anúncio a partir de codigo e url_amigavel', () => {
    const { items, total } = parseSearchResponse(
      {
        lista: [buildRawItem(22_089, 'apartamento-bonsucesso-bh')],
        quantidade: 1,
      },
      BASE_URL,
      TipoTransacao.VENDA,
    );

    expect(total).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      link: `${BASE_URL}/imovel/apartamento-bonsucesso-bh/22089`,
      tipoTransacao: TipoTransacao.VENDA,
    });
  });

  it('descarta item sem codigo ou url_amigavel, sem lançar erro', () => {
    const { items, total } = parseSearchResponse(
      {
        lista: [{ codigo: 1 }, buildRawItem(2, 'imovel-valido')],
        quantidade: 2,
      },
      BASE_URL,
      TipoTransacao.ALUGUEL,
    );

    expect(total).toBe(2);
    expect(items).toHaveLength(1);
    expect(items[0]?.link).toBe(`${BASE_URL}/imovel/imovel-valido/2`);
  });

  it('lança erro para uma resposta em formato inesperado', () => {
    expect(() =>
      parseSearchResponse({ nada: 'a ver' }, BASE_URL, TipoTransacao.VENDA),
    ).toThrow();
  });
});
