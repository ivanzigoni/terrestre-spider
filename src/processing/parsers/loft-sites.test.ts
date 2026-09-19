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
    expect(anuncio.imagemUrl).toBe(
      'https://cdn.vistahost.com.br/cli35793/vista.imobi/fotos/3919/i24wb7Dhp531ib7437A_39196a918f3f59cb6.jpg',
    );
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
    expect(anuncio.imagemUrl).toBe(
      'https://cdn.vistahost.com.br/habitarc/vista.imobi/fotos/10661/i4946uyPy113yV6g76_106616a91edc00b1da.jpg',
    );
  });

  it('extrai habitar_pampulha quando a API Vista devolve campos numéricos (Dormitorios, ValorVenda, Latitude etc. como number, não string)', () => {
    const anuncio = parseLoftSites(
      readFixture('habitar_pampulha__detalhe-campos-numericos.html'),
    );

    expect(anuncio.codigoExterno).toBe('10485');
    expect(anuncio.precoVenda).toBe(45_900_000);
    expect(anuncio.precoAluguel).toBeNull();
    expect(anuncio.disponivelVenda).toBe(true);
    expect(anuncio.disponivelAluguel).toBe(false);
    expect(anuncio.quartos).toBe(2);
    expect(anuncio.suites).toBe(1);
    expect(anuncio.banheiros).toBe(3);
    expect(anuncio.vagas).toBe(1);
    expect(anuncio.area).toBe(64);
    expect(anuncio.bairro).toBe('São João Batista');
    expect(anuncio.cidade).toBe('Belo Horizonte');
    expect(anuncio.latitude).toBe(-19.8259461);
    expect(anuncio.longitude).toBe(-43.963963);
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
    expect(anuncio.imagemUrl).toBe(
      'https://cdn.vistahost.com.br/modelo25529/vista.imobi/fotos/3859/i16Olw8I8E2N_38596363d82e6bda5.jpg',
    );
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
    expect(anuncio.imagemUrl).toBe(
      'https://cdn.vistahost.com.br/primer24837/vista.imobi/fotos/12300/i013B_123006548e09be331f.jpg',
    );
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
    expect(anuncio.imagemUrl).toBe(
      'https://cdn.vistahost.com.br/cli29574/vista.imobi/fotos/3217/iZe6u5mgEONWp3_32176a918db643b27.jpg',
    );
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
    expect(anuncio.imagemUrl).toBe(
      'https://cdn.vistahost.com.br/clie26659/vista.imobi/fotos/273/io3h3g_27368d568d5859aa.jpg',
    );
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
    expect(anuncio.imagemUrl).toBe(
      'https://cdn.vistahost.com.br/topmig25592/vista.imobi/fotos/2368/id8OXF4uXH915i3341_23686a5502b942885.jpg',
    );
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
    expect(anuncio.imagemUrl).toBe(
      'https://cdn.vistahost.com.br/venda25586/vista.imobi/fotos/6041/i9894Ratz4d1cNc7_60416a91dd8c21640.jpg',
    );
  });
});
