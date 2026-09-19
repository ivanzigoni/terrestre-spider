import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseCasaMineira } from './casa-mineira.js';

const html = readFileSync(
  'src/processing/parsers/__fixtures__/casa_mineira__detalhe.html',
  'utf-8',
);

describe('parseCasaMineira', () => {
  it('reaproveita o template do Imovelweb e lê o preço oficial do DOM, não do ld+json', () => {
    const anuncio = parseCasaMineira(html);

    expect(anuncio.codigoExterno).toBe('3021741726');
    expect(anuncio.precoAluguel).toBe(463_000);
    expect(anuncio.precoVenda).toBeNull();
    expect(anuncio.disponivelAluguel).toBe(true);
    expect(anuncio.disponivelVenda).toBe(false);
    expect(anuncio.condominio).toBe(45_000);
    expect(anuncio.iptu).toBe(26_800);
  });

  it('extrai campos do ld+json Apartment e vagas/suítes dos ícones', () => {
    const anuncio = parseCasaMineira(html);

    expect(anuncio.area).toBe(155);
    expect(anuncio.quartos).toBe(4);
    expect(anuncio.banheiros).toBe(3);
    expect(anuncio.vagas).toBe(2);
    expect(anuncio.suites).toBe(2);
    expect(anuncio.bairro).toBe('Ipiranga');
    expect(anuncio.endereco).toBe('Rua Maura');
    expect(anuncio.numero).toBeNull();
    expect(anuncio.cidade).toBe('Belo Horizonte');
    expect(anuncio.imagemUrl).toBe(
      'https://imgbr.imovelwebcdn.com/avisos/22/30/21/74/17/26/720x532/5713303645.jpg?isFirstImage=true',
    );
  });

  it('não encontra anunciante, CRECI ou descrição nesta fonte (não republica esses blocos)', () => {
    const anuncio = parseCasaMineira(html);

    expect(anuncio.anuncianteNome).toBeNull();
    expect(anuncio.codigoCreci).toBeNull();
    expect(anuncio.descricao).toBeNull();
  });
});
