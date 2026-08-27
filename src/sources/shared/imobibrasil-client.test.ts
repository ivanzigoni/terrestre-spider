import { describe, expect, it } from 'vitest';

import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import {
  isDetalheImovelUrl,
  parseTipoTransacaoFromSlug,
} from './imobibrasil-client.js';

describe('parseTipoTransacaoFromSlug', () => {
  it('reconhece venda pelo slug', () => {
    const url =
      'https://www.struturalimoveis.com.br/imovel/4291055/apartamento-venda-belo-horizonte-mg-santo-antonio';
    expect(parseTipoTransacaoFromSlug(url)).toBe(TipoTransacao.VENDA);
  });

  it('reconhece locação pelo slug, mapeando para TipoTransacao.ALUGUEL', () => {
    const url =
      'https://www.limaimoveisbarreiro.com.br/imovel/1234/apartamento-locacao-belo-horizonte-mg-barreiro';
    expect(parseTipoTransacaoFromSlug(url)).toBe(TipoTransacao.ALUGUEL);
  });

  it('reconhece venda mesmo sem sufixo de cidade/bairro (caso real observado)', () => {
    const url =
      'https://www.limaimoveisbarreiro.com.br/imovel/4244583/chacara-venda';
    expect(parseTipoTransacaoFromSlug(url)).toBe(TipoTransacao.VENDA);
  });

  it('retorna null quando o slug não traz nenhum dos dois marcadores', () => {
    const url = 'https://www.struturalimoveis.com.br/imovel/999/terreno';
    expect(parseTipoTransacaoFromSlug(url)).toBeNull();
  });
});

describe('isDetalheImovelUrl', () => {
  it('aceita página de imóvel individual (ID numérico logo após /imovel/)', () => {
    const url =
      'https://www.struturalimoveis.com.br/imovel/4291055/apartamento-venda-belo-horizonte-mg-santo-antonio';
    expect(isDetalheImovelUrl(url)).toBe(true);
  });

  it('rejeita página de categoria sob o mesmo prefixo /imovel/ (achado real do sitemap)', () => {
    const url =
      'https://www.struturalimoveis.com.br/imovel/venda/apartamento/belo-horizonte/';
    expect(isDetalheImovelUrl(url)).toBe(false);
  });

  it('rejeita a raiz /imovel/', () => {
    expect(
      isDetalheImovelUrl('https://www.struturalimoveis.com.br/imovel/'),
    ).toBe(false);
  });
});
