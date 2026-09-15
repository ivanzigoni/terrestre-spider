import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseNetimoveis } from './netimoveis.js';

const html = readFileSync(
  'src/processing/parsers/__fixtures__/netimoveis__detalhe.html',
  'utf-8',
);

describe('parseNetimoveis', () => {
  it('extrai os campos principais do anúncio', () => {
    const anuncio = parseNetimoveis(html);

    expect(anuncio.codigoExterno).toBe('1186502');
    expect(anuncio.precoAluguel).toBe(120000);
    expect(anuncio.precoVenda).toBeNull();
    expect(anuncio.area).toBeCloseTo(26.88);
    expect(anuncio.quartos).toBe(0);
  });

  it('extrai condomínio, IPTU e demais características', () => {
    const anuncio = parseNetimoveis(html);

    expect(anuncio.condominio).toBe(31700);
    expect(anuncio.iptu).toBe(15300);
    expect(anuncio.banheiros).toBe(1);
    expect(anuncio.vagas).toBe(0);
    expect(anuncio.suites).toBeNull();
  });

  it('extrai tipo, endereço e anunciante', () => {
    const anuncio = parseNetimoveis(html);

    expect(anuncio.tipoImovelBruto).toBe('loja');
    expect(anuncio.endereco).toBe('Avenida Cristiano Machado');
    expect(anuncio.bairro).toBe('Cidade Nova');
    expect(anuncio.cidade).toBe('Belo Horizonte');
    expect(anuncio.anuncianteNome).toBe('Casa Muniz Netimóveis');
    expect(anuncio.codigoCreci).toBe('7211');
  });

  it('lança erro quando o código do imóvel não é encontrado', () => {
    expect(() =>
      parseNetimoveis('<html><body>sem dados</body></html>'),
    ).toThrow();
  });
});
