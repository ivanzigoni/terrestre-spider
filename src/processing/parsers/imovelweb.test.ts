import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseImovelweb } from './imovelweb.js';

const html = readFileSync(
  'src/processing/parsers/__fixtures__/imovelweb__detalhe.html',
  'utf-8',
);

describe('parseImovelweb', () => {
  it('extrai código a partir de og:url e distingue aluguel de venda pelo DOM', () => {
    const anuncio = parseImovelweb(html);

    expect(anuncio.codigoExterno).toBe('3035234998');
    expect(anuncio.precoAluguel).toBe(673_000);
    expect(anuncio.precoVenda).toBeNull();
  });

  it('separa condomínio e IPTU do mesmo bloco de texto', () => {
    const anuncio = parseImovelweb(html);

    expect(anuncio.condominio).toBe(155_200);
    expect(anuncio.iptu).toBe(52_000);
  });

  it('extrai campos do ld+json Apartment', () => {
    const anuncio = parseImovelweb(html);

    expect(anuncio.area).toBe(350);
    expect(anuncio.quartos).toBe(3);
    expect(anuncio.banheiros).toBe(3);
    expect(anuncio.bairro).toBe('São Pedro');
    expect(anuncio.endereco).toBe('Rua Major Lopes');
    expect(anuncio.numero).toBe('750');
    expect(anuncio.cidade).toBe('Belo Horizonte');
    expect(anuncio.estado).toBe('Minas Gerais');
  });

  it('extrai vagas e suítes dos ícones de característica', () => {
    const anuncio = parseImovelweb(html);

    expect(anuncio.vagas).toBe(2);
    expect(anuncio.suites).toBe(1);
  });

  it('extrai anunciante, CRECI e descrição; não tenta extrair data de publicação', () => {
    const anuncio = parseImovelweb(html);

    expect(anuncio.anuncianteNome).toBe('WHY IMOVEIS');
    expect(anuncio.codigoCreci).toBe('7712 MG');
    expect(anuncio.descricao).toMatch(/^Excelente área privativa/);
    expect(anuncio.publicadoEm).toBeNull();
  });

  it('lança erro para um HTML sem og:url', () => {
    expect(() =>
      parseImovelweb('<html><body>sem dados</body></html>'),
    ).toThrow();
  });
});
