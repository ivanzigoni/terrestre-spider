import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseQuintoAndar } from './quinto-andar.js';

const html = readFileSync(
  'src/processing/parsers/__fixtures__/quinto_andar__detalhe.html',
  'utf-8',
);

describe('parseQuintoAndar', () => {
  it('extrai os campos principais a partir de houseInfo, ignorando title/ld+json', () => {
    const anuncio = parseQuintoAndar(html);

    expect(anuncio.codigoExterno).toBe('895254660');
    expect(anuncio.precoVenda).toBe(149_900_000);
    expect(anuncio.precoAluguel).toBeNull();
    expect(anuncio.disponivelVenda).toBe(true);
    expect(anuncio.disponivelAluguel).toBe(false);
    expect(anuncio.condominio).toBe(0);
    expect(anuncio.iptu).toBe(51_800);
    expect(anuncio.area).toBe(420);
    expect(anuncio.quartos).toBe(4);
    expect(anuncio.suites).toBe(1);
    expect(anuncio.banheiros).toBe(4);
    expect(anuncio.vagas).toBe(6);
    expect(anuncio.tipoImovelBruto).toBe('Casa');
    expect(anuncio.imagemUrl).toBe(
      'https://www.quintoandar.com.br/img/xlg/original895254660-565.6663642344112aIMG7508.jpg',
    );
  });

  it('extrai localização de houseInfo.address', () => {
    const anuncio = parseQuintoAndar(html);

    expect(anuncio.bairro).toBe('Itapoã');
    expect(anuncio.cidade).toBe('Belo Horizonte');
    expect(anuncio.estado).toBe('MG');
    expect(anuncio.cep).toBe('31710-050');
    expect(anuncio.endereco).toBe('Rua Gumercindo Couto E Silva');
    expect(anuncio.latitude).toBeCloseTo(-19.8425354);
    expect(anuncio.longitude).toBeCloseTo(-43.9572117);
  });

  it('extrai descrição e data de publicação', () => {
    const anuncio = parseQuintoAndar(html);

    expect(anuncio.descricao).toMatch(/^Esta casa em Belo Horizonte/);
    expect(anuncio.publicadoEm).toEqual(new Date('2026-08-29T00:15:22.157Z'));
  });

  it('lança erro para um HTML sem script#__NEXT_DATA__', () => {
    expect(() =>
      parseQuintoAndar('<html><body>sem dados</body></html>'),
    ).toThrow();
  });
});
