import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import {
  businessContextFor,
  buildSearchRequestPayload,
  extractLocationSlug,
  parseSearchListResponse,
} from './api-client.js';

const currentDirPath = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(
  currentDirPath,
  '__fixtures__',
  'search-list-response.sample.json',
);

async function loadFixture(): Promise<unknown> {
  const raw = await readFile(FIXTURE_PATH, 'utf-8');
  return JSON.parse(raw) as unknown;
}

describe('extractLocationSlug', () => {
  it('extrai o último segmento de path como slug', () => {
    expect(
      extractLocationSlug(
        'https://www.quintoandar.com.br/alugar/imovel/belo-horizonte-mg-brasil',
      ),
    ).toBe('belo-horizonte-mg-brasil');
  });

  it('lança erro para uma URL sem path', () => {
    expect(() =>
      extractLocationSlug('https://www.quintoandar.com.br/'),
    ).toThrow();
  });
});

describe('businessContextFor', () => {
  it('mapeia ALUGUEL para RENT e VENDA para SALE', () => {
    expect(businessContextFor(TipoTransacao.ALUGUEL)).toBe('RENT');
    expect(businessContextFor(TipoTransacao.VENDA)).toBe('SALE');
  });
});

describe('buildSearchRequestPayload', () => {
  it('gera um payload JSON com slug, businessContext e paginação corretos', () => {
    const payload = JSON.parse(
      buildSearchRequestPayload({
        slug: 'belo-horizonte-mg-brasil',
        businessContext: 'RENT',
        offset: 48,
      }),
    ) as Record<string, unknown>;

    expect(payload.slug).toBe('belo-horizonte-mg-brasil');
    expect((payload.pagination as Record<string, unknown>).offset).toBe(48);
    expect((payload.filters as Record<string, unknown>).businessContext).toBe(
      'RENT',
    );
  });
});

describe('parseSearchListResponse', () => {
  it('mapeia só os itens que batem com o tipoTransacao pedido, montando o link a partir do id', async () => {
    const fixture = await loadFixture();

    const { items, total } = parseSearchListResponse(
      fixture,
      TipoTransacao.ALUGUEL,
    );

    // A fixture tem 3 hits: 2 com forRent=true (um deles sem "area", irrelevante agora
    // que só id/forRent/forSale são lidos) e 1 de venda (forRent=false, filtrado).
    expect(total).toBe(3);
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.link)).toEqual([
      'https://www.quintoandar.com.br/imovel/894334726',
      'https://www.quintoandar.com.br/imovel/895226985',
    ]);
    expect(
      items.every((item) => item.tipoTransacao === TipoTransacao.ALUGUEL),
    ).toBe(true);
  });

  it('descarta item sem id/forRent/forSale, sem lançar erro', () => {
    const fixtureComItemMalformado = {
      hits: {
        total: { value: 2 },
        hits: [
          { _source: { id: 111, forRent: true, forSale: false } },
          { _source: { id: 222 } },
        ],
      },
    };

    const { items, total } = parseSearchListResponse(
      fixtureComItemMalformado,
      TipoTransacao.ALUGUEL,
    );

    expect(total).toBe(2);
    expect(items).toHaveLength(1);
    expect(items[0]?.link).toBe('https://www.quintoandar.com.br/imovel/111');
  });

  it('lança erro para uma resposta em formato inesperado', () => {
    expect(() =>
      parseSearchListResponse({ nada: 'a ver' }, TipoTransacao.ALUGUEL),
    ).toThrow();
  });
});
