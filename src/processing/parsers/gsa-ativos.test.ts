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
    expect(anuncio.disponivelAluguel).toBe(true);
    expect(anuncio.disponivelVenda).toBe(false);
    expect(anuncio.imagemUrl).toBe(
      'https://gsaativos.com.br/wp-content/uploads/2025/08/EDIT_lunafachada.png',
    );
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

function htmlComEndereco(endereco: string): string {
  const campos = ['', endereco, '', '', '', '', '', '', '', '']
    .map(
      (texto) =>
        `<div class="jet-listing-dynamic-field__content">${texto}</div>`,
    )
    .join('');
  return `<html><body><h2 class="elementor-heading-title">COD: X1</h2>${campos}</body></html>`;
}

describe('parseGsaAtivos: endereço em formatos variados', () => {
  it.each([
    [
      'R. Dr. Gonçalo de Moura, 1400 - São Damião, Vespasiano',
      {
        endereco: 'R. Dr. Gonçalo de Moura',
        numero: '1400',
        bairro: 'São Damião',
        cidade: 'Vespasiano',
      },
    ],
    [
      'Av. Raja Gabáglia, 1781 - Cidade Jardim, Belo Horizonte - MG, 30380-457',
      {
        endereco: 'Av. Raja Gabáglia',
        numero: '1781',
        bairro: 'Cidade Jardim',
        cidade: 'Belo Horizonte',
        estado: 'MG',
        cep: '30380-457',
      },
    ],
    [
      'Rua da Acácias 205 – Vale do Sereno',
      {
        endereco: 'Rua da Acácias',
        numero: '205',
        bairro: 'Vale do Sereno',
        cidade: null,
      },
    ],
    [
      'Rod. Januário Carneiro, 8625 Vale do Sereno, Nova Lima',
      {
        endereco: 'Rod. Januário Carneiro',
        numero: '8625',
        bairro: 'Vale do Sereno',
        cidade: 'Nova Lima',
      },
    ],
    [
      'Av. Edmeia Matos Lazzarotti, 2765, Horto',
      { numero: '2765', bairro: 'Horto', cidade: null },
    ],
    [
      'Rua Yvon Magalhães Pinto, 607',
      { endereco: 'Rua Yvon Magalhães Pinto', numero: '607', bairro: null },
    ],
    [
      'Rua dos Timbiras, nº. 2072, bairro Lourdes',
      { numero: '2072', bairro: 'Lourdes' },
    ],
    [
      'Buritis, Belo Horizonte',
      { endereco: null, bairro: 'Buritis', cidade: 'Belo Horizonte' },
    ],
    [
      'Rua São Paulo, 1381 Lourdes',
      { endereco: 'Rua São Paulo', numero: '1381', bairro: 'Lourdes' },
    ],
    [
      'R. Júlio de Castilho, 1070 Palmeiras, Belo Horizonte MG',
      {
        numero: '1070',
        bairro: 'Palmeiras',
        cidade: 'Belo Horizonte',
        estado: 'MG',
      },
    ],
    [
      'Avenida do Contorno, Gutierrez Belo Horizonte',
      { bairro: 'Gutierrez', cidade: 'Belo Horizonte' },
    ],
    [
      'Rua Levindo Lopes, no 357 - Savassi - BH/MG',
      { numero: '357', bairro: 'Savassi', cidade: 'Belo Horizonte' },
    ],
    [
      'Rua dos Guajajaras, nº 175, Bairro Centro, Belo Horizonte/MG, CEP 30.180-100',
      {
        numero: '175',
        bairro: 'Centro',
        cidade: 'Belo Horizonte',
        cep: '30180-100',
      },
    ],
    [
      'R. José Rodrigues Pereira, 388 - Estoril CEP - 30455-640',
      { numero: '388', bairro: 'Estoril', cep: '30455-640' },
    ],
    [
      'Av. do Contorno 2905 Santa Efigênia',
      {
        endereco: 'Av. do Contorno',
        numero: '2905',
        bairro: 'Santa Efigênia',
      },
    ],
    [
      'Rua 15 de Novembro, 200',
      { endereco: 'Rua 15 de Novembro', numero: '200', bairro: null },
    ],
  ])('interpreta "%s"', (texto, esperado) => {
    expect(parseGsaAtivos(htmlComEndereco(texto))).toMatchObject(esperado);
  });
});
