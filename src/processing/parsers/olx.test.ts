import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseOlx } from './olx.js';

const html = readFileSync(
  'src/processing/parsers/__fixtures__/olx__detalhe.html',
  'utf-8',
);

describe('parseOlx', () => {
  it('extrai os campos principais do anúncio', () => {
    const anuncio = parseOlx(html);

    expect(anuncio.codigoExterno).toBe('1530395909');
    expect(anuncio.precoAluguel).toBe(110000);
    expect(anuncio.precoVenda).toBeNull();
    expect(anuncio.disponivelAluguel).toBe(true);
    expect(anuncio.disponivelVenda).toBe(false);
    expect(anuncio.area).toBe(68);
    expect(anuncio.quartos).toBe(2);
    expect(anuncio.banheiros).toBe(1);
    expect(anuncio.vagas).toBe(1);
    expect(anuncio.imagemUrl).toBe(
      'https://img.olx.com.br/images/33/335627679803201.jpg',
    );
  });

  it('trata "Não informado" em condomínio e IPTU como null', () => {
    const anuncio = parseOlx(html);

    expect(anuncio.condominio).toBeNull();
    expect(anuncio.iptu).toBeNull();
  });

  it('extrai localização, tipo e anunciante', () => {
    const anuncio = parseOlx(html);

    expect(anuncio.cidade).toBe('São José da Lapa');
    expect(anuncio.estado).toBe('MG');
    expect(anuncio.cep).toBe('33350000');
    expect(anuncio.latitude).toBeCloseTo(-19.706048);
    expect(anuncio.longitude).toBeCloseTo(-43.968795);
    expect(anuncio.tipoImovelBruto).toBe('Aluguel - apartamento padrão');
    expect(anuncio.anuncianteNome).toBe('Carlos');
    expect(anuncio.publicadoEm).toEqual(new Date('2026-08-28T23:38:40.000Z'));
  });

  it('lança erro para um HTML sem script#initial-data', () => {
    expect(() => parseOlx('<html><body>sem dados</body></html>')).toThrow();
  });
});
