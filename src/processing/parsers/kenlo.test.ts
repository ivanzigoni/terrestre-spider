import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseKenlo } from './kenlo.js';

const FIXTURES_DIR = 'src/processing/parsers/__fixtures__/';

function readFixture(name: string): string {
  return readFileSync(FIXTURES_DIR + name, 'utf-8');
}

describe('parseKenlo', () => {
  it('extrai jmc_imoveis (aluguel, sem condomínio por ausência da chave)', () => {
    const anuncio = parseKenlo(readFixture('jmc_imoveis__detalhe.html'));

    expect(anuncio.codigoExterno).toBe('CA0641');
    expect(anuncio.precoAluguel).toBe(380_000);
    expect(anuncio.iptu).toBe(12_000);
    expect(anuncio.condominio).toBeNull();
    expect(anuncio.quartos).toBe(3);
    expect(anuncio.suites).toBe(1);
    expect(anuncio.banheiros).toBe(3);
    expect(anuncio.vagas).toBe(2);
    expect(anuncio.area).toBe(95.16);
    expect(anuncio.bairro).toBe('Dona Clara');
    expect(anuncio.anuncianteNome).toBe('Jmc Imóveis');
    expect(anuncio.codigoCreci).toBeNull();
    expect(anuncio.atualizadoEm).toEqual(new Date('2026-08-27T13:07:24.657'));
  });

  it('extrai luxus_imoveis_premium (aluguel, com condomínio e corretor)', () => {
    const anuncio = parseKenlo(
      readFixture('luxus_imoveis_premium__detalhe.html'),
    );

    expect(anuncio.codigoExterno).toBe('CO0746');
    expect(anuncio.precoAluguel).toBe(2_400_000);
    expect(anuncio.iptu).toBe(108_400);
    expect(anuncio.condominio).toBe(300_000);
    expect(anuncio.quartos).toBe(5);
    expect(anuncio.suites).toBe(4);
    expect(anuncio.banheiros).toBe(7);
    expect(anuncio.vagas).toBe(4);
    expect(anuncio.area).toBe(540);
    expect(anuncio.bairro).toBe('Funcionários');
    expect(anuncio.anuncianteNome).toBe('Luxus Imóveis Premium');
    expect(anuncio.codigoCreci).toBe('58153');
  });
});
