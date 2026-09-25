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
    expect(anuncio.disponivelAluguel).toBe(true);
    expect(anuncio.disponivelVenda).toBe(false);
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
    expect(anuncio.imagemUrl).toBe(
      'https://imgbr.imovelwebcdn.com/avisos/2/30/35/23/49/98/720x532/6688473390.jpg?isFirstImage=true',
    );
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

interface MontarHtmlParams {
  ldBlocos: readonly Record<string, unknown>[];
  ogUrl: string;
  titulo?: string;
}

function montarHtml({
  ldBlocos,
  ogUrl,
  titulo = '',
}: MontarHtmlParams): string {
  const scripts = ldBlocos
    .map(
      (bloco) =>
        `<script type="application/ld+json">${JSON.stringify(bloco)}</script>`,
    )
    .join('');
  return `<html><head><title>${titulo}</title><meta property="og:url" content="${ogUrl}">${scripts}</head><body></body></html>`;
}

const ENDERECO_VAZIO = {
  '@type': 'PostalAddress',
  addressLocality: '',
  addressRegion: '',
  streetAddress: '',
};

describe('parseImovelweb: bairro', () => {
  it('ignora o bloco VideoObject que antecede o imóvel e lê o endereço do bloco do imóvel', () => {
    const anuncio = parseImovelweb(
      montarHtml({
        ogUrl:
          'https://www.casamineira.com.br/imovel/venda/casa-4-quartos-a-venda-no-candelaria-belo-horizonte-mg/2979842605',
        ldBlocos: [
          { '@type': 'VideoObject', name: 'video' },
          {
            '@type': 'House',
            address: {
              '@type': 'PostalAddress',
              addressLocality:
                'Belo Horizonte, Minas Gerais, Brasil casamineira, ',
              addressRegion: 'Candelária',
              streetAddress: 'Rua Brasilianita',
            },
          },
        ],
      }),
    );

    expect(anuncio.bairro).toBe('Candelária');
    expect(anuncio.cidade).toBe('Belo Horizonte');
    expect(anuncio.estado).toBe('Minas Gerais');
  });

  it('usa o slug da URL quando o endereço do ld+json vem vazio', () => {
    const anuncio = parseImovelweb(
      montarHtml({
        ogUrl:
          'https://www.casamineira.com.br/imovel/venda/apartamento-4-quartos-a-venda-no-itapoa-belo-horizonte-mg/3035967082',
        ldBlocos: [{ '@type': 'Apartment', address: ENDERECO_VAZIO }],
      }),
    );

    expect(anuncio.bairro).toBe('itapoa');
  });

  it('usa o título da página quando o endereço do ld+json vem vazio e a URL não traz o bairro', () => {
    const anuncio = parseImovelweb(
      montarHtml({
        ogUrl:
          'https://www.imovelweb.com.br/propriedades/apartamento-a-venda-castelo-3-quartos-82-m2-3034120327.html',
        titulo:
          'Apartamento à venda com 3 Quartos, Castelo, Belo Horizonte - R$ 550.000, 82 m2 - ID: 3034120327 - Imovelweb',
        ldBlocos: [{ '@type': 'Apartment', address: ENDERECO_VAZIO }],
      }),
    );

    expect(anuncio.bairro).toBe('Castelo');
  });

  it('mantém o bairro nulo quando nem o ld+json, nem o título, nem o slug o trazem', () => {
    const anuncio = parseImovelweb(
      montarHtml({
        ogUrl:
          'https://www.casamineira.com.br/imovel/venda/casa-3-quartos-a-venda-no-belo-horizonte-mg/2997181026',
        ldBlocos: [{ '@type': 'House', address: ENDERECO_VAZIO }],
      }),
    );

    expect(anuncio.bairro).toBeNull();
  });
});
