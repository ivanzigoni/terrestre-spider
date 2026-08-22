import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
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
  it('mapeia só os itens que batem com o tipoTransacao pedido, ignorando itens malformados', async () => {
    const fixture = await loadFixture();

    const { items, total } = parseSearchListResponse(
      fixture,
      TipoTransacao.ALUGUEL,
    );

    // A fixture tem 3 hits: 1 aluguel válido, 1 venda válida (filtrada por não bater
    // forRent), 1 com "area" ausente (guard de shape descarta antes de checar o flag).
    expect(total).toBe(3);
    expect(items).toHaveLength(1);

    const item = items[0];
    if (item === undefined) {
      throw new Error('item esperado ausente em items');
    }
    expect(item.origem).toBe(OrigemAnuncio.QUINTO_ANDAR);
    expect(item.tipoTransacao).toBe(TipoTransacao.ALUGUEL);
    expect(item.link).toBe('https://www.quintoandar.com.br/imovel/894334726');
    expect(item.tipoImovel).toBe('Apartamento');
    expect(item.quartos).toBe(3);
    expect(item.area).toBe(98);
    expect(item.localizacao).toBe('Buritis, Belo Horizonte');
    expect(item.preco).toBe(6800);
    expect(item.iptu).toBe(532);
    expect(item.condominio).toBe(1150);
    expect(item.dataDePublicacaoText).toBeNull();
    expect(item.precoAntigo).toBeNull();
  });

  it('normaliza o sentinela -1 de iptu/condomínio para 0', () => {
    // Recorte isolado, só com o hit de iptu/condomínio sentinela — não depende da
    // fixture completa usada no teste acima.
    const fixtureComItemSentinela = {
      hits: {
        total: { value: 1 },
        hits: [
          {
            _source: {
              id: 895226985,
              address: 'Rua Professor Alberto Deodato',
              area: 271,
              bedrooms: 3,
              bathrooms: 2,
              parkingSpaces: 1,
              rent: 9690,
              salePrice: 0,
              condominium: -1,
              iptu: -1,
              type: 'Casa',
              forRent: true,
              forSale: false,
              neighbourhood: 'Bandeirantes',
              city: 'Belo Horizonte',
            },
          },
        ],
      },
    };

    const { items } = parseSearchListResponse(
      fixtureComItemSentinela,
      TipoTransacao.ALUGUEL,
    );

    expect(items).toHaveLength(1);
    const item = items[0];
    if (item === undefined) {
      throw new Error('item esperado ausente em items');
    }
    expect(item.iptu).toBe(0);
    expect(item.condominio).toBe(0);
  });

  it('lança erro para uma resposta em formato inesperado', () => {
    expect(() =>
      parseSearchListResponse({ nada: 'a ver' }, TipoTransacao.ALUGUEL),
    ).toThrow();
  });
});
