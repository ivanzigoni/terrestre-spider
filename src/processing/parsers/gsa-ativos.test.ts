import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseGsaAtivos } from './gsa-ativos.js';

const html = readFileSync(
  'src/processing/parsers/__fixtures__/gsa_ativos__detalhe.html',
  'utf-8',
);

describe('parseGsaAtivos', () => {
  it('extrai código, endereço e preço pela posição dos campos dinâmicos do JetEngine', () => {
    const anuncio = parseGsaAtivos(html);

    expect(anuncio.codigoExterno).toBe('L13A0014');
    expect(anuncio.endereco).toBe('Rua Padre Pedro Pinto');
    expect(anuncio.numero).toBe('1595');
    expect(anuncio.bairro).toBe('Venda Nova');
    expect(anuncio.precoAluguel).toBe(600_000);
    expect(anuncio.precoVenda).toBeNull();
  });

  it('extrai área, banheiros, condomínio e IPTU do bloco de informações adicionais', () => {
    const anuncio = parseGsaAtivos(html);

    expect(anuncio.area).toBe(57);
    expect(anuncio.banheiros).toBe(1);
    expect(anuncio.condominio).toBe(50_000);
    expect(anuncio.iptu).toBe(21_500);
  });

  it('deixa quartos, suítes e vagas como null (imóvel comercial, sem esse dado na amostra)', () => {
    const anuncio = parseGsaAtivos(html);

    expect(anuncio.quartos).toBeNull();
    expect(anuncio.suites).toBeNull();
    expect(anuncio.vagas).toBeNull();
    expect(anuncio.publicadoEm).toBeNull();
  });

  it('lança erro para um HTML sem heading "COD: ..."', () => {
    expect(() =>
      parseGsaAtivos('<html><body>sem dados</body></html>'),
    ).toThrow();
  });
});
