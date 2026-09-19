import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseChaveCerta } from './chave-certa.js';

const html = readFileSync(
  'src/processing/parsers/__fixtures__/chave_certa_imoveis_bh__detalhe.html',
  'utf-8',
);

describe('parseChaveCerta', () => {
  it('extrai código, preço (venda por padrão via category ForSale) e localização do ld+json', () => {
    const anuncio = parseChaveCerta(html);

    expect(anuncio.codigoExterno).toBe('716');
    expect(anuncio.precoVenda).toBe(32_500_000);
    expect(anuncio.precoAluguel).toBeNull();
    expect(anuncio.disponivelVenda).toBe(true);
    expect(anuncio.disponivelAluguel).toBe(false);
    expect(anuncio.bairro).toBe('Araguaia');
    expect(anuncio.cidade).toBe('Belo Horizonte');
    expect(anuncio.estado).toBe('MG');
    expect(anuncio.imagemUrl).toBe(
      'https://imagens.tecimob.com.br/media/dcda8854-f780-44ae-80b9-d5e274511f85/properties/4f79b2cb-c2ec-4307-a56f-ece81aae09b8/images/26e6aede-6f19-4072-aa34-72fc3e701ec61787763297UJkI.jpg',
    );
  });

  it('extrai quartos e banheiros do ld+json e área do par Line_title/Line_value no DOM', () => {
    const anuncio = parseChaveCerta(html);

    expect(anuncio.quartos).toBe(2);
    expect(anuncio.banheiros).toBe(1);
    expect(anuncio.area).toBe(48);
  });

  it('deixa condomínio e IPTU como null (não confirmados nesta amostra)', () => {
    const anuncio = parseChaveCerta(html);

    expect(anuncio.condominio).toBeNull();
    expect(anuncio.iptu).toBeNull();
  });

  it('extrai anunciante, CRECI e data de publicação', () => {
    const anuncio = parseChaveCerta(html);

    expect(anuncio.anuncianteNome).toBe('Chave Certa Imóveis BH');
    expect(anuncio.codigoCreci).toBe('38758F');
    expect(anuncio.publicadoEm).toEqual(new Date('2026-08-29'));
  });

  it('lança erro para um HTML sem ld+json RealEstateListing', () => {
    expect(() =>
      parseChaveCerta('<html><body>sem dados</body></html>'),
    ).toThrow();
  });
});
