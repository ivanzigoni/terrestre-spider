import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseStiloNetimoveis } from './stilo-netimoveis.js';

const html = readFileSync(
  'src/processing/parsers/__fixtures__/stilo_netimoveis__detalhe.html',
  'utf-8',
);

describe('parseStiloNetimoveis', () => {
  it('extrai código, preço de venda e condomínio do mapa rótulo/valor', () => {
    const anuncio = parseStiloNetimoveis(html);

    expect(anuncio.codigoExterno).toBe('1158944');
    expect(anuncio.precoVenda).toBe(31_050_000);
    expect(anuncio.precoAluguel).toBeNull();
    expect(anuncio.condominio).toBe(39_200);
    expect(anuncio.iptu).toBeNull();
  });

  it('extrai área, quartos, banheiros e vagas via regex sobre o texto visível', () => {
    const anuncio = parseStiloNetimoveis(html);

    expect(anuncio.area).toBeCloseTo(45.14);
    expect(anuncio.quartos).toBe(1);
    expect(anuncio.banheiros).toBe(1);
    expect(anuncio.vagas).toBe(1);
    expect(anuncio.tipoImovelBruto).toBe('Apartamento');
  });

  it('separa endereço, número, bairro e cidade do texto livre abaixo do título', () => {
    const anuncio = parseStiloNetimoveis(html);

    expect(anuncio.endereco).toBe('Avenida Professor Clóvis Salgado');
    expect(anuncio.numero).toBe('2881');
    expect(anuncio.bairro).toBe('Bandeirantes');
    expect(anuncio.cidade).toBe('Belo Horizonte');
  });

  it('extrai a descrição da seção "Mais sobre este imóvel"', () => {
    const anuncio = parseStiloNetimoveis(html);

    expect(anuncio.descricao).toMatch(
      /^Apartamento à venda 1 quarto no bairro Bandeirantes/,
    );
  });

  it('lança erro para um HTML sem #codigoImovel', () => {
    expect(() =>
      parseStiloNetimoveis('<html><body>sem dados</body></html>'),
    ).toThrow();
  });
});
