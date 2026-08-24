import { describe, expect, it } from 'vitest';

import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import { buildSearchUrl, parseSearchResponse } from './kenlo-client.js';

const BASE_URL = 'https://www.exemplo-kenlo.com.br';

/**
 * Item mínimo válido, moldado na captura real de JMC/Luxus (ver
 * discovery/independentes-diagnostico.md, Achado 2, e lote 2 de
 * .claude/__workdir/integracao-lote/lotes.md) — `sale_price`/`rent_price` como par
 * `[min, max]`, `property_tax`/`condo_fees` opcionalmente `null`.
 */
function buildRawItem(overrides: Record<string, unknown> = {}): unknown {
  return {
    url: '/imovel/apartamento-belo-horizonte-3-quartos-92-m/AP2382-EXE',
    heading1: 'Apartamento com 3 quartos, 92 m²',
    neighborhood: 'Santa Rosa',
    city: 'Belo Horizonte',
    bedrooms: [3, 3],
    bathrooms: [2, 2],
    garages: [2, 2],
    area: [92, 92],
    sale_price: [0, 0],
    rent_price: [3000, 3000],
    property_type: 'APARTMENT',
    property_tax: 156,
    condo_fees: 614.45,
    updated_at: '2026-08-19T14:15:06.157',
    ...overrides,
  };
}

function parse(items: unknown[], tipoTransacao: TipoTransacao) {
  return parseSearchResponse(
    { data: items, count: items.length },
    BASE_URL,
    OrigemAnuncio.JMC_IMOVEIS,
    tipoTransacao,
  );
}

describe('buildSearchUrl', () => {
  it('monta a URL de venda com segmento "a-venda" e o slug de cidade no path', () => {
    const url = buildSearchUrl(BASE_URL, {
      tipoTransacao: TipoTransacao.VENDA,
      numeroPagina: 1,
      cidadeSlug: 'belo-horizonte',
    });
    expect(url).toBe(
      `${BASE_URL}/api/listings/a-venda/belo-horizonte?com-fotos=true&expand=1&pagina=1`,
    );
  });

  it('monta a URL de aluguel com segmento "para-alugar"', () => {
    const url = buildSearchUrl(BASE_URL, {
      tipoTransacao: TipoTransacao.ALUGUEL,
      numeroPagina: 3,
      cidadeSlug: 'belo-horizonte',
    });
    expect(url).toBe(
      `${BASE_URL}/api/listings/para-alugar/belo-horizonte?com-fotos=true&expand=1&pagina=3`,
    );
  });
});

describe('parseSearchResponse', () => {
  it('usa sale_price[0] quando a transação é venda', () => {
    const { items } = parse(
      [buildRawItem({ sale_price: [652_900, 652_900], rent_price: [0, 0] })],
      TipoTransacao.VENDA,
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.preco).toBe(652_900);
  });

  it('usa rent_price[0] quando a transação é aluguel', () => {
    const { items } = parse([buildRawItem()], TipoTransacao.ALUGUEL);
    expect(items).toHaveLength(1);
    expect(items[0]?.preco).toBe(3000);
  });

  it('mapeia property_tax para iptu e condo_fees para condominio', () => {
    const { items } = parse([buildRawItem()], TipoTransacao.ALUGUEL);
    expect(items[0]?.iptu).toBe(156);
    expect(items[0]?.condominio).toBe(614.45);
  });

  it('trata property_tax e condo_fees nulos como 0 (imóvel de venda sem IPTU informado)', () => {
    const { items } = parse(
      [buildRawItem({ property_tax: null, condo_fees: null })],
      TipoTransacao.ALUGUEL,
    );
    expect(items[0]?.iptu).toBe(0);
    expect(items[0]?.condominio).toBe(0);
  });

  it('não descarta o item quando property_tax/condo_fees estão ausentes do JSON, não apenas null (regressão: 8 de 12 itens da p1 de venda da JMC caíam aqui)', () => {
    const item = buildRawItem();
    delete (item as Record<string, unknown>).property_tax;
    delete (item as Record<string, unknown>).condo_fees;
    const { items } = parse([item], TipoTransacao.ALUGUEL);
    expect(items).toHaveLength(1);
    expect(items[0]?.iptu).toBe(0);
    expect(items[0]?.condominio).toBe(0);
  });

  it('sempre grava precoAntigo como null — Kenlo não expõe preço anterior', () => {
    const { items } = parse([buildRawItem()], TipoTransacao.ALUGUEL);
    expect(items[0]?.precoAntigo).toBeNull();
  });

  it('preserva property_type como veio da fonte, sem tradução', () => {
    const { items } = parse(
      [buildRawItem({ property_type: 'PENTHOUSE_APARTMENT' })],
      TipoTransacao.VENDA,
    );
    expect(items[0]?.tipoImovel).toBe('PENTHOUSE_APARTMENT');
  });

  it('não é afetado pelo formato de property_purposes (string ou array) — tipoTransacao vem do segmento consultado, não deste campo', () => {
    const { items: viaString } = parse(
      [buildRawItem({ property_purposes: 'FOR_RENT' })],
      TipoTransacao.ALUGUEL,
    );
    const { items: viaArray } = parse(
      [buildRawItem({ property_purposes: ['FOR_SALE', 'FOR_RENT'] })],
      TipoTransacao.ALUGUEL,
    );
    expect(viaString[0]?.tipoTransacao).toBe(TipoTransacao.ALUGUEL);
    expect(viaArray[0]?.tipoTransacao).toBe(TipoTransacao.ALUGUEL);
  });

  it('monta o link concatenando baseUrl com o path relativo de url', () => {
    const { items } = parse([buildRawItem()], TipoTransacao.ALUGUEL);
    expect(items[0]?.link).toBe(
      `${BASE_URL}/imovel/apartamento-belo-horizonte-3-quartos-92-m/AP2382-EXE`,
    );
  });

  it('ignora item malformado (sem derrubar o lote inteiro)', () => {
    const { items, total } = parse(
      [buildRawItem(), { url: '/incompleto' }],
      TipoTransacao.ALUGUEL,
    );
    expect(total).toBe(2);
    expect(items).toHaveLength(1);
  });
});
