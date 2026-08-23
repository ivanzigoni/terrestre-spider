import { describe, expect, it } from 'vitest';

import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import { parseSearchResponse } from './imoview-client.js';

const BASE_URL = 'https://www.exemplo-imoview.com.br';

/**
 * Item mínimo válido para `isRawImoviewListingItem`, só com `valoranterior`
 * variando entre os testes — os três sentinelas de "sem valor anterior"
 * observados no cluster (string vazia, "R$ 0,00" e número 0), mais um valor
 * numérico positivo real, confirmado na resposta do Casa Grande em
 * `discovery/imoview-diagnostico.md`.
 */
function buildRawItem(valoranterior: string | number): unknown {
  return {
    codigo: 22089,
    titulo: 'Apartamento à venda, Bonsucesso - Belo Horizonte/MG',
    tipo: 'Apartamento',
    bairro: 'Bonsucesso',
    cidade: 'Belo Horizonte',
    numeroquartos: '2',
    numerobanhos: '1',
    numerovagas: '1',
    areainterna: '43,74',
    valor: 'R$ 235.000,00',
    valoranterior,
    datahoracadastro: '2026-06-27 10:41:40',
    url_amigavel: 'apartamento-a-venda-bonsucesso-belo-horizonte-mg',
  };
}

function parse(items: unknown[]) {
  return parseSearchResponse(
    { lista: items, quantidade: items.length },
    BASE_URL,
    OrigemAnuncio.CASA_GRANDE_IMOVEIS,
    TipoTransacao.VENDA,
  );
}

describe('parseSearchResponse — valoranterior', () => {
  it('trata string vazia (sentinela Buritis) como sem valor anterior', () => {
    const { items } = parse([buildRawItem('')]);
    expect(items).toHaveLength(1);
    expect(items[0]?.precoAntigo).toBeNull();
  });

  it('trata "R$ 0,00" (sentinela Liderar) como sem valor anterior', () => {
    const { items } = parse([buildRawItem('R$ 0,00')]);
    expect(items).toHaveLength(1);
    expect(items[0]?.precoAntigo).toBeNull();
  });

  it('trata número 0 (sentinela Casa Grande) como sem valor anterior', () => {
    const { items } = parse([buildRawItem(0)]);
    expect(items).toHaveLength(1);
    expect(items[0]?.precoAntigo).toBeNull();
  });

  it('preserva um valor numérico positivo de valoranterior', () => {
    const { items } = parse([buildRawItem(250_000)]);
    expect(items).toHaveLength(1);
    expect(items[0]?.precoAntigo).toBe(250_000);
  });

  it('preserva um valor de string formatada em BRL de valoranterior', () => {
    const { items } = parse([buildRawItem('R$ 250.000,00')]);
    expect(items).toHaveLength(1);
    expect(items[0]?.precoAntigo).toBe(250_000);
  });

  it('não descarta mais o item por causa de valoranterior numérico (regressão Casa Grande)', () => {
    // Antes do fix, `isRawImoviewListingItem` exigia `valoranterior: string` e
    // rejeitava o item inteiro em silêncio — a captura real do Casa Grande
    // (discovery/imoview-diagnostico.md) tinha `quantidade: 457` mas
    // `items.length === 0` por causa exatamente disso.
    const { items, total } = parse([buildRawItem(0), buildRawItem(0)]);
    expect(total).toBe(2);
    expect(items).toHaveLength(2);
  });
});
