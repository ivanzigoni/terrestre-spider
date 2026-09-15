import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseImoview } from './imoview.js';

function lerFixture(nome: string): string {
  return readFileSync(`src/processing/parsers/__fixtures__/${nome}`, 'utf-8');
}

describe('parseImoview', () => {
  it('extrai imobiliaria_buritis__detalhe.html', () => {
    const resultado = parseImoview(
      lerFixture('imobiliaria_buritis__detalhe.html'),
    );

    expect(resultado.codigoExterno).toBe('30237');
    expect(resultado.precoAluguel).toBe(330_000);
    expect(resultado.precoVenda).toBeNull();
    expect(resultado.disponivelAluguel).toBe(true);
    expect(resultado.disponivelVenda).toBe(false);
    expect(resultado.quartos).toBe(3);
    expect(resultado.area).toBe(100);
  });

  it('extrai ivi_invista_imoveis__detalhe.html', () => {
    const resultado = parseImoview(
      lerFixture('ivi_invista_imoveis__detalhe.html'),
    );

    expect(resultado.codigoExterno).toBe('3312');
    expect(resultado.precoAluguel).toBe(240_000);
    expect(resultado.precoVenda).toBeNull();
    expect(resultado.disponivelAluguel).toBe(true);
    expect(resultado.disponivelVenda).toBe(false);
    expect(resultado.quartos).toBe(3);
    expect(resultado.area).toBe(92);
  });

  it('extrai diego_garcia_imoveis__detalhe.html', () => {
    const resultado = parseImoview(
      lerFixture('diego_garcia_imoveis__detalhe.html'),
    );

    expect(resultado.codigoExterno).toBe('1940');
    expect(resultado.precoAluguel).toBe(150_000);
    expect(resultado.precoVenda).toBeNull();
    expect(resultado.disponivelAluguel).toBe(true);
    expect(resultado.disponivelVenda).toBe(false);
    expect(resultado.quartos).toBe(1);
    expect(resultado.area).toBe(20);
  });

  it('extrai adimoveis_bh__detalhe.html', () => {
    const resultado = parseImoview(lerFixture('adimoveis_bh__detalhe.html'));

    expect(resultado.codigoExterno).toBe('1278');
    expect(resultado.precoAluguel).toBe(130_000);
    expect(resultado.precoVenda).toBeNull();
    expect(resultado.disponivelAluguel).toBe(true);
    expect(resultado.disponivelVenda).toBe(false);
    expect(resultado.quartos).toBe(2);
    expect(resultado.area).toBe(40);
  });

  it('extrai casa_grande_imoveis__detalhe.html', () => {
    const resultado = parseImoview(
      lerFixture('casa_grande_imoveis__detalhe.html'),
    );

    expect(resultado.codigoExterno).toBe('21584');
    expect(resultado.precoAluguel).toBe(680_000);
    expect(resultado.precoVenda).toBeNull();
    expect(resultado.disponivelAluguel).toBe(true);
    expect(resultado.disponivelVenda).toBe(false);
    expect(resultado.quartos).toBe(0);
    expect(resultado.area).toBe(112);
  });

  it('extrai liderar_imoveis__detalhe.html', () => {
    const resultado = parseImoview(lerFixture('liderar_imoveis__detalhe.html'));

    expect(resultado.codigoExterno).toBe('115');
    expect(resultado.precoAluguel).toBe(180_000);
    expect(resultado.precoVenda).toBeNull();
    expect(resultado.disponivelAluguel).toBe(true);
    expect(resultado.disponivelVenda).toBe(false);
    expect(resultado.quartos).toBe(2);
    expect(resultado.area).toBe(60);
  });

  it('extrai valore_imoveis__detalhe.html', () => {
    const resultado = parseImoview(lerFixture('valore_imoveis__detalhe.html'));

    expect(resultado.codigoExterno).toBe('39815');
    expect(resultado.precoAluguel).toBe(400_000);
    expect(resultado.precoVenda).toBeNull();
    expect(resultado.disponivelAluguel).toBe(true);
    expect(resultado.disponivelVenda).toBe(false);
    expect(resultado.quartos).toBe(3);
    expect(resultado.area).toBe(95);
  });
});
