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

    expect(anuncio.codigoExterno).toBe('4404');
    expect(anuncio.precoVenda).toBe(35_000_000);
    expect(anuncio.precoAluguel).toBeNull();
    expect(anuncio.disponivelVenda).toBe(true);
    expect(anuncio.disponivelAluguel).toBe(false);
    expect(anuncio.tipoImovelBruto).toBe('Apartamento');
    expect(anuncio.imagemUrl).toBe(
      'https://imobiliariapampulha.com.br/wp-content/uploads/2023/01/maxresdefault.jpg',
    );
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

  it('lança erro para um HTML sem postid-<n> na classe do body', () => {
    expect(() =>
      parseImobiliariaPampulha('<html><body>sem dados</body></html>'),
    ).toThrow();
  });
});

function htmlComTitulo(titulo: string): string {
  return `<html><body class="postid-1"><h2>${titulo}</h2></body></html>`;
}

describe('parseImobiliariaPampulha: bairro em títulos de formatos variados', () => {
  it.each([
    ['Casa à venda Barroca com 70m², 2 quartos e com vaga', 'Barroca'],
    ['Galpão / Depósito / Armazém à venda, 1747m² no Centro', 'Centro'],
    [
      'Galpão / Depósito / Armazém para alugar, 400m² – Bairro Vale do Jatobá',
      'Vale do Jatobá',
    ],
    ['Lote/Terreno à Venda, 420 m² Bom Retiro', 'Bom Retiro'],
    [
      'Kitnet com 1 Quarto e 1 banheiro à Venda, 22 m² no Dona Clara',
      'Dona Clara',
    ],
    ['Loja / Salão / Ponto Comercial para alugar, 25m² – Serrano', 'Serrano'],
    [
      'Loja / Salão / Ponto Comercial para alugar, 59m² – Pampulha – Bairro Ouro Preto',
      'Ouro Preto',
    ],
    ['Loja / 4 banheiros à Venda, 390 m² no Centro BH', 'Centro'],
    [
      'Loja/Conjunto para venda possui 27 metros quadrados em Liberdade',
      'Liberdade',
    ],
    ['Casa com 3 Quartos para alugar, 248m² – Bairro da Graça', 'Graça'],
    ['Sala Comercial e 1 banheiro à Venda, 45 m² bairro Estoril', 'Estoril'],
    ['Casa com 3 Quartos para alugar, 80m² – Jardim Leblon', 'Jardim Leblon'],
  ])('extrai o bairro de "%s"', (titulo, bairroEsperado) => {
    expect(parseImobiliariaPampulha(htmlComTitulo(titulo)).bairro).toBe(
      bairroEsperado,
    );
  });

  it('retorna bairro nulo quando o título não traz localização', () => {
    expect(
      parseImobiliariaPampulha(htmlComTitulo('Apartamento para alugar')).bairro,
    ).toBeNull();
  });
});
