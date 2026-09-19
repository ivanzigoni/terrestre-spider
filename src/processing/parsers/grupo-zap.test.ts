import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseVivaReal, parseZapImoveis } from './grupo-zap.js';

const vivaRealHtml = readFileSync(
  'src/processing/parsers/__fixtures__/viva_real__detalhe.html',
  'utf-8',
);
const zapImoveisHtml = readFileSync(
  'src/processing/parsers/__fixtures__/zap_imoveis__detalhe.html',
  'utf-8',
);

describe('parseVivaReal', () => {
  it('extrai os campos principais do anúncio', () => {
    const anuncio = parseVivaReal(vivaRealHtml);

    expect(anuncio.codigoExterno).toBe('2908097823');
    expect(anuncio.precoAluguel).toBe(440000);
    expect(anuncio.precoVenda).toBeNull();
    expect(anuncio.disponivelAluguel).toBe(true);
    expect(anuncio.disponivelVenda).toBe(false);
    expect(anuncio.area).toBe(113);
    expect(anuncio.quartos).toBe(2);
    expect(anuncio.imagemUrl).toBe(
      'https://resizedimgs.vivareal.com/img/vr-listing/e98d5b04032189e0fc4a80c33d99a06a/cobertura-com-2-quartos-para-alugar-113m-no-buritis-belo-horizonte.webp?action=fit-in&dimension=614x297',
    );
  });

  it('extrai condomínio, IPTU, características e localização', () => {
    const anuncio = parseVivaReal(vivaRealHtml);

    expect(anuncio.condominio).toBe(59000);
    expect(anuncio.iptu).toBe(31100);
    expect(anuncio.suites).toBe(1);
    expect(anuncio.banheiros).toBe(3);
    expect(anuncio.vagas).toBe(2);
    expect(anuncio.bairro).toBe('Buritis');
    expect(anuncio.cidade).toBe('Belo Horizonte');
    expect(anuncio.estado).toBe('MG');
    expect(anuncio.endereco).toBe('Rua Ignácio Alves Martins');
    expect(anuncio.numero).toBe('78');
  });

  it('extrai descrição e anunciante', () => {
    const anuncio = parseVivaReal(vivaRealHtml);

    expect(anuncio.descricao).toContain(
      'Cobertura Nova para Alugar no Buritis',
    );
    expect(anuncio.anuncianteNome).toBe('Edm Imóveis');
    expect(anuncio.codigoCreci).toBe('09718-J-MG');
  });
});

describe('parseZapImoveis', () => {
  it('extrai os campos principais do anúncio', () => {
    const anuncio = parseZapImoveis(zapImoveisHtml);

    expect(anuncio.codigoExterno).toBe('2900803807');
    expect(anuncio.precoAluguel).toBe(1657000);
    expect(anuncio.precoVenda).toBeNull();
    expect(anuncio.disponivelAluguel).toBe(true);
    expect(anuncio.disponivelVenda).toBe(false);
    expect(anuncio.area).toBe(220);
    expect(anuncio.quartos).toBe(4);
    expect(anuncio.imagemUrl).toBe(
      'https://resizedimgs.zapimoveis.com.br/img/vr-listing/3332f96fefe9088d9b09426ad63c6a6d/apartamento-com-4-quartos-para-alugar-220m-no-santa-lucia-belo-horizonte.webp?action=fit-in&dimension=614x297',
    );
  });

  it('trata IPTU ausente como null e extrai condomínio', () => {
    const anuncio = parseZapImoveis(zapImoveisHtml);

    expect(anuncio.condominio).toBe(150000);
    expect(anuncio.iptu).toBeNull();
    expect(anuncio.suites).toBe(2);
    expect(anuncio.banheiros).toBe(4);
    expect(anuncio.vagas).toBe(4);
  });

  it('trata license vazia do anunciante como null', () => {
    const anuncio = parseZapImoveis(zapImoveisHtml);

    expect(anuncio.anuncianteNome).toBe('Wellington Batista');
    expect(anuncio.codigoCreci).toBeNull();
  });
});
