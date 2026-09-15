import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseImobiliariaPampulha } from './imobiliaria-pampulha.js';

const html = readFileSync(
  'src/processing/parsers/__fixtures__/imobiliaria_pampulha__detalhe.html',
  'utf-8',
);

describe('parseImobiliariaPampulha', () => {
  it('extrai código, preço e tipo de transação a partir do título', () => {
    const anuncio = parseImobiliariaPampulha(html);

    expect(anuncio.codigoExterno).toBe('123456');
    expect(anuncio.precoVenda).toBe(35_000_000);
    expect(anuncio.precoAluguel).toBeNull();
    expect(anuncio.tipoImovelBruto).toBe('Apartamento');
  });

  it('trata "Não Informado" em condomínio como null e extrai o IPTU informado', () => {
    const anuncio = parseImobiliariaPampulha(html);

    expect(anuncio.condominio).toBeNull();
    expect(anuncio.iptu).toBe(150_000);
  });

  it('extrai área, quartos, banheiros e vagas via regex sobre o texto visível', () => {
    const anuncio = parseImobiliariaPampulha(html);

    expect(anuncio.area).toBe(100);
    expect(anuncio.quartos).toBe(3);
    expect(anuncio.banheiros).toBe(2);
    expect(anuncio.vagas).toBe(2);
  });

  it('extrai bairro embutido no título e descrição', () => {
    const anuncio = parseImobiliariaPampulha(html);

    expect(anuncio.bairro).toBe('Buritis');
    expect(anuncio.descricao).toMatch(/^Imóvel aconchegante/);
  });

  it('lança erro para um HTML sem span.codigo-imv', () => {
    expect(() =>
      parseImobiliariaPampulha('<html><body>sem dados</body></html>'),
    ).toThrow();
  });
});
