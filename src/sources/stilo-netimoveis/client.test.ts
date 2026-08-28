import { describe, expect, it } from 'vitest';

import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import {
  buildDetailUrl,
  buildSearchUrl,
  parseSearchResponse,
  tipoTransacaoParaParam,
} from './client.js';

describe('tipoTransacaoParaParam', () => {
  it('mapeia VENDA para "venda"', () => {
    expect(tipoTransacaoParaParam(TipoTransacao.VENDA)).toBe('venda');
  });

  it('mapeia ALUGUEL para "locacao"', () => {
    expect(tipoTransacaoParaParam(TipoTransacao.ALUGUEL)).toBe('locacao');
  });
});

describe('buildSearchUrl', () => {
  it('monta a URL do admin-ajax.php com action, transacao e pagina', () => {
    const url = new URL(buildSearchUrl('venda', 2));
    expect(url.origin + url.pathname).toBe(
      'https://www.stilonetimoveis.com.br/wp-admin/admin-ajax.php',
    );
    expect(url.searchParams.get('action')).toBe('pesquisar_imoveis');
    expect(url.searchParams.get('transacao')).toBe('venda');
    expect(url.searchParams.get('pagina')).toBe('2');
    expect(url.searchParams.get('localizacao')).toContain('belo-horizonte');
  });
});

describe('buildDetailUrl', () => {
  it('resolve o path relativo contra o domínio do site', () => {
    expect(
      buildDetailUrl(
        'imovel/venda-sala-minas-gerais-belo-horizonte-centro-sul-lourdes/1192388/',
      ),
    ).toBe(
      'https://www.stilonetimoveis.com.br/imovel/venda-sala-minas-gerais-belo-horizonte-centro-sul-lourdes/1192388/',
    );
  });
});

describe('parseSearchResponse', () => {
  it('extrai o link de detalhe de cada item da lista', () => {
    const json = {
      lista: [{ urlDetalheImovel: 'imovel/venda-sala-.../1192388/' }],
    };
    expect(parseSearchResponse(json)).toEqual([
      'https://www.stilonetimoveis.com.br/imovel/venda-sala-.../1192388/',
    ]);
  });

  it('descarta item sem urlDetalheImovel, sem lançar', () => {
    const json = { lista: [{ imovelSan_Id: 1 }] };
    expect(parseSearchResponse(json)).toEqual([]);
  });

  it('lança em formato de resposta inesperado', () => {
    expect(() => parseSearchResponse({ foo: 'bar' })).toThrow();
  });
});
