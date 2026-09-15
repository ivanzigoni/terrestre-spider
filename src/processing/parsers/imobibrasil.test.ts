import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseImobiBrasil } from './imobibrasil.js';

const FIXTURES_DIR = 'src/processing/parsers/__fixtures__/';

function readFixture(name: string): string {
  return readFileSync(FIXTURES_DIR + name, 'utf-8');
}

describe('parseImobiBrasil', () => {
  it('extrai lima_imoveis_barreiro (venda, código alfanumérico do DOM)', () => {
    const anuncio = parseImobiBrasil(
      readFixture('lima_imoveis_barreiro__detalhe.html'),
    );

    expect(anuncio.codigoExterno).toBe('APTO008');
    expect(anuncio.precoVenda).toBe(61_950_000);
    expect(anuncio.precoAluguel).toBeNull();
    expect(anuncio.disponivelVenda).toBe(true);
    expect(anuncio.disponivelAluguel).toBe(false);
    expect(anuncio.quartos).toBe(3);
    expect(anuncio.suites).toBe(1);
    expect(anuncio.banheiros).toBe(2);
    expect(anuncio.vagas).toBe(2);
    expect(anuncio.condominio).toBe(25_000);
    expect(anuncio.iptu).toBe(30_000);
    expect(anuncio.area).toBe(85);
    expect(anuncio.bairro).toBe('Barreiro');
    expect(anuncio.cidade).toBe('Belo Horizonte');
    expect(anuncio.estado).toBe('MG');
  });

  it('extrai strutural_imobiliaria (venda, código numérico curto do DOM)', () => {
    const anuncio = parseImobiBrasil(
      readFixture('strutural_imobiliaria__detalhe.html'),
    );

    expect(anuncio.codigoExterno).toBe('1');
    expect(anuncio.precoVenda).toBe(168_000_000);
    expect(anuncio.precoAluguel).toBeNull();
    expect(anuncio.disponivelVenda).toBe(true);
    expect(anuncio.disponivelAluguel).toBe(false);
    expect(anuncio.quartos).toBe(4);
    expect(anuncio.suites).toBe(2);
    expect(anuncio.banheiros).toBe(4);
    expect(anuncio.vagas).toBe(3);
    expect(anuncio.condominio).toBe(165_000);
    expect(anuncio.iptu).toBe(50_000);
    expect(anuncio.area).toBe(280);
    expect(anuncio.bairro).toBe('Santo Antônio');
  });
});
