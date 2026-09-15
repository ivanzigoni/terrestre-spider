import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseMyBroker } from './my-broker.js';

const html = readFileSync(
  'src/processing/parsers/__fixtures__/my_broker_belo_horizonte__detalhe.html',
  'utf-8',
);

describe('parseMyBroker', () => {
  it('extrai código do imóvel e localização do empreendimento', () => {
    const anuncio = parseMyBroker(html);

    expect(anuncio.codigoExterno).toBe('127188');
    expect(anuncio.bairro).toBe('Sion');
    expect(anuncio.cidade).toBe('Belo Horizonte');
    expect(anuncio.estado).toBe('MG');
  });

  it('extrai condomínio e IPTU do texto livre "Sobre o imóvel"', () => {
    const anuncio = parseMyBroker(html);

    expect(anuncio.condominio).toBe(65_000);
    expect(anuncio.iptu).toBe(50_000);
  });

  it('documenta a limitação de nível de empreendimento: preço, área e cômodos ficam null', () => {
    const anuncio = parseMyBroker(html);

    expect(anuncio.precoVenda).toBeNull();
    expect(anuncio.precoAluguel).toBeNull();
    expect(anuncio.area).toBeNull();
    expect(anuncio.quartos).toBeNull();
    expect(anuncio.suites).toBeNull();
    expect(anuncio.banheiros).toBeNull();
    expect(anuncio.vagas).toBeNull();
  });

  it('extrai a descrição a partir do texto "Sobre o imóvel"', () => {
    const anuncio = parseMyBroker(html);

    expect(anuncio.descricao).toMatch(/^Quartos: 2 Quartos, sendo 2 suítes/);
  });

  it('lança erro para um HTML sem "Código do imóvel"', () => {
    expect(() =>
      parseMyBroker('<html><body>sem dados</body></html>'),
    ).toThrow();
  });
});
