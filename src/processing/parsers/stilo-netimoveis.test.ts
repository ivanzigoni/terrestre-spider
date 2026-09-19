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
    expect(anuncio.disponivelVenda).toBe(true);
    expect(anuncio.disponivelAluguel).toBe(false);
    expect(anuncio.condominio).toBe(39_200);
    expect(anuncio.iptu).toBeNull();
    expect(anuncio.imagemUrl).toBe(
      'https://fotosimoveis.blob.core.windows.net/fotos-imoveis/2/109/1158944/3f4c6238-fd6b-4c6f-93f7-2e504370d0e1.webp',
    );
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

  it('separa bairro e cidade mesmo quando o endereço não tem número de lote', () => {
    const htmlSemNumero = `
      <html>
        <body>
          <div id="titulo">Galpão à venda</div>
          <div class="mb-1 text-gray">Avenida Frei Orlando, Caiçaras Belo Horizonte</div>
          <div id="codigoImovel"><span>1234567</span></div>
        </body>
      </html>
    `;

    const anuncio = parseStiloNetimoveis(htmlSemNumero);

    expect(anuncio.endereco).toBe('Avenida Frei Orlando');
    expect(anuncio.numero).toBeNull();
    expect(anuncio.bairro).toBe('Caiçaras');
    expect(anuncio.cidade).toBe('Belo Horizonte');
  });
});
