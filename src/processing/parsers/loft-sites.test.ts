import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseLoftSites } from './loft-sites.js';

const FIXTURES_DIR = 'src/processing/parsers/__fixtures__/';

function readFixture(name: string): string {
  return readFileSync(FIXTURES_DIR + name, 'utf-8');
}

describe('parseLoftSites', () => {
  it('extrai casa_pampulha_imoveis (venda)', () => {
    const anuncio = parseLoftSites(
      readFixture('casa_pampulha_imoveis__detalhe.html'),
    );

    expect(anuncio.codigoExterno).toBe('3919');
    expect(anuncio.precoVenda).toBe(110_000_000);
    expect(anuncio.precoAluguel).toBeNull();
    expect(anuncio.disponivelVenda).toBe(true);
    expect(anuncio.disponivelAluguel).toBe(false);
    expect(anuncio.quartos).toBe(3);
    expect(anuncio.vagas).toBe(1);
    expect(anuncio.bairro).toBe('Planalto');
    expect(anuncio.cidade).toBe('Belo Horizonte');
  });

  it('extrai habitar_pampulha (venda)', () => {
    const anuncio = parseLoftSites(
      readFixture('habitar_pampulha__detalhe.html'),
    );

    expect(anuncio.codigoExterno).toBe('10660');
    expect(anuncio.precoVenda).toBe(98_000_000);
    expect(anuncio.precoAluguel).toBeNull();
    expect(anuncio.disponivelVenda).toBe(true);
    expect(anuncio.disponivelAluguel).toBe(false);
    expect(anuncio.tipoImovelBruto).toBe('Casa em Condomínio');
    expect(anuncio.vagas).toBe(2);
    expect(anuncio.bairro).toBe('Santa Amélia');
  });

  it('extrai modelo_imovel (venda, código alfanumérico)', () => {
    const anuncio = parseLoftSites(readFixture('modelo_imovel__detalhe.html'));

    expect(anuncio.codigoExterno).toBe('MO1802');
    expect(anuncio.precoVenda).toBe(83_000_000);
    expect(anuncio.disponivelVenda).toBe(true);
    expect(anuncio.disponivelAluguel).toBe(false);
    expect(anuncio.quartos).toBe(1);
    expect(anuncio.vagas).toBe(2);
    expect(anuncio.condominio).toBeNull();
    expect(anuncio.iptu).toBeNull();
  });

  it('extrai primer_imoveis (venda, condomínio com valor suspeito extraído como está)', () => {
    const anuncio = parseLoftSites(readFixture('primer_imoveis__detalhe.html'));

    expect(anuncio.codigoExterno).toBe('GPI12300');
    expect(anuncio.precoVenda).toBe(63_000_000);
    expect(anuncio.disponivelVenda).toBe(true);
    expect(anuncio.disponivelAluguel).toBe(false);
    expect(anuncio.quartos).toBe(3);
    expect(anuncio.vagas).toBe(6);
    expect(anuncio.condominio).toBe(2);
    expect(anuncio.bairro).toBe('Vale do Sol');
  });

  it('extrai real_imoveis_pampulha (venda)', () => {
    const anuncio = parseLoftSites(
      readFixture('real_imoveis_pampulha__detalhe.html'),
    );

    expect(anuncio.codigoExterno).toBe('4045');
    expect(anuncio.precoVenda).toBe(56_000_000);
    expect(anuncio.disponivelVenda).toBe(true);
    expect(anuncio.disponivelAluguel).toBe(false);
    expect(anuncio.quartos).toBe(3);
    expect(anuncio.vagas).toBe(3);
    expect(anuncio.bairro).toBe('Rio Branco');
  });

  it('extrai seven_imoveis (venda, sem latitude/longitude e sem descrição legível)', () => {
    const anuncio = parseLoftSites(readFixture('seven_imoveis__detalhe.html'));

    expect(anuncio.codigoExterno).toBe('428');
    expect(anuncio.precoVenda).toBe(79_693_600);
    expect(anuncio.disponivelVenda).toBe(true);
    expect(anuncio.disponivelAluguel).toBe(false);
    expect(anuncio.vagas).toBe(1);
    expect(anuncio.latitude).toBeNull();
    expect(anuncio.longitude).toBeNull();
    expect(anuncio.descricao).toBeNull();
  });

  it('extrai topmig_imoveis (venda, lote com campos de característica vazios)', () => {
    const anuncio = parseLoftSites(readFixture('topmig_imoveis__detalhe.html'));

    expect(anuncio.codigoExterno).toBe('2368');
    expect(anuncio.precoVenda).toBe(110_000_000);
    expect(anuncio.disponivelVenda).toBe(true);
    expect(anuncio.disponivelAluguel).toBe(false);
    expect(anuncio.quartos).toBeNull();
    expect(anuncio.suites).toBeNull();
    expect(anuncio.vagas).toBeNull();
    expect(anuncio.tipoImovelBruto).toBe('Casa comercial');
  });

  it('extrai venda_nova_imoveis (aluguel, com corretor preenchido)', () => {
    const anuncio = parseLoftSites(
      readFixture('venda_nova_imoveis__detalhe.html'),
    );

    expect(anuncio.codigoExterno).toBe('6041');
    expect(anuncio.precoVenda).toBeNull();
    expect(anuncio.precoAluguel).toBe(190_000);
    expect(anuncio.disponivelVenda).toBe(false);
    expect(anuncio.disponivelAluguel).toBe(true);
    expect(anuncio.quartos).toBe(2);
    expect(anuncio.vagas).toBe(1);
    expect(anuncio.anuncianteNome).toBe('Welvis Mota');
    expect(anuncio.codigoCreci).toBe('61218');
  });
});
