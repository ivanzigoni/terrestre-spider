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
    expect(resultado.imagemUrl).toBe(
      'https://cdn.imoview.com.br/buritis/Imoveis/30237/0k1v7-whatsapp-image-2025-01-13-at-124401-1736784419.jpeg?1737145680',
    );
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
    expect(resultado.imagemUrl).toBe(
      'https://cdn.imoview.com.br/iviinvista/Imoveis/3312/uf033j-imovel-3472-2-1786545305.jpg?1786545306',
    );
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
    expect(resultado.imagemUrl).toBe(
      'https://cdn.imoview.com.br/saimobiliaria/Imoveis/1940/abgur-original895242693-409023172698938943-1782172878.jpeg?1782172878',
    );
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
    expect(resultado.imagemUrl).toBe(
      'https://cdn.imoview.com.br/adimoveis/Imoveis/1278/k9czw-img-0076-1787945202.jpg?1787945202',
    );
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
    expect(resultado.imagemUrl).toBe(
      'https://cdn.imoview.com.br/casagrande/Imoveis/21584/lw04gh-whatsapp-image-2026-03-10-at-172521-1775064732.jpeg?1775162511',
    );
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
    expect(resultado.imagemUrl).toBe(
      'https://cdn.imoview.com.br/liderar/Imoveis/115/0o8pbf-whatsapp-image-2026-08-28-at-121701-1787930560.jpeg?1787930561',
    );
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
    expect(resultado.imagemUrl).toBe(
      'https://cdn.imoview.com.br/valore/Imoveis/39815/ymywv-whatsapp-image-2026-08-28-at-170830-1787949395.jpeg?1787949396',
    );
  });
});
