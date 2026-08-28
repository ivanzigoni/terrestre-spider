import { describe, expect, it } from 'vitest';

import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import {
  buildDetailUrl,
  buildSearchUrl,
  parseSearchResponse,
  tipoTransacaoParaUserIntent,
} from './client.js';

describe('tipoTransacaoParaUserIntent', () => {
  it('mapeia VENDA para "comprar"', () => {
    expect(tipoTransacaoParaUserIntent(TipoTransacao.VENDA)).toBe('comprar');
  });

  it('mapeia ALUGUEL para "alugar"', () => {
    expect(tipoTransacaoParaUserIntent(TipoTransacao.ALUGUEL)).toBe('alugar');
  });
});

describe('buildSearchUrl', () => {
  it('monta a URL de /api/properties com company_id, user_intent e page', () => {
    const url = new URL(buildSearchUrl('comprar', 3));
    expect(url.origin + url.pathname).toBe(
      'https://www.mybroker.com.br/api/properties',
    );
    expect(url.searchParams.get('user_intent')).toBe('comprar');
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('company_id')).toBe(
      '413b4bd7-96e9-4f49-859d-7fbc5c9a7c2d',
    );
  });
});

describe('buildDetailUrl', () => {
  it('monta a URL de detalhe a partir do code numérico', () => {
    expect(buildDetailUrl(127188)).toBe(
      'https://www.mybroker.com.br/agencia/belo-horizonte/imoveis/127188',
    );
  });
});

describe('parseSearchResponse', () => {
  it('extrai o link de detalhe de cada item de properties', () => {
    const json = { properties: [{ code: 127188 }] };
    expect(parseSearchResponse(json)).toEqual([
      'https://www.mybroker.com.br/agencia/belo-horizonte/imoveis/127188',
    ]);
  });

  it('descarta item sem code, sem lançar', () => {
    const json = { properties: [{ id: 'abc' }] };
    expect(parseSearchResponse(json)).toEqual([]);
  });

  it('lança em formato de resposta inesperado', () => {
    expect(() => parseSearchResponse({ foo: 'bar' })).toThrow();
  });
});
