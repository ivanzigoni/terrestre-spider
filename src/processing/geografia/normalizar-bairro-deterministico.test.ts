import { describe, expect, it } from 'vitest';

import type { ReferenciaBairro } from './normalizar-bairro-deterministico.js';
import { normalizarBairroDeterministico } from './normalizar-bairro-deterministico.js';

const CENTRO_SUL = 10;
const BARREIRO = 20;
const OESTE = 30;
const PAMPULHA = 40;
const LESTE = 50;

const referencia = new Map<string, ReferenciaBairro>([
  ['SAVASSI', { bairroId: 1, bairro: 'SAVASSI', regionalId: CENTRO_SUL }],
  ['DIAMANTE', { bairroId: 2, bairro: 'DIAMANTE', regionalId: BARREIRO }],
  ['BURITIS', { bairroId: 3, bairro: 'BURITIS', regionalId: OESTE }],
  ['CENTRO', { bairroId: 4, bairro: 'CENTRO', regionalId: CENTRO_SUL }],
  ['NOVA SUISSA', { bairroId: 5, bairro: 'NOVA SUISSA', regionalId: OESTE }],
  [
    'BANDEIRANTES',
    { bairroId: 6, bairro: 'BANDEIRANTES', regionalId: PAMPULHA },
  ],
  ['BELEM', { bairroId: 7, bairro: 'BELÉM', regionalId: LESTE }],
]);

describe('normalizarBairroDeterministico', () => {
  it('resolve por match exato após normalizar caixa/acento/espaço', () => {
    expect(normalizarBairroDeterministico('savassi', referencia)).toEqual({
      bairroId: 1,
      bairro: 'SAVASSI',
      regionalId: CENTRO_SUL,
    });
  });

  it('não resolve grafia divergente da oficial (documentado: cai pro LLM, não é bug)', () => {
    expect(normalizarBairroDeterministico('Nova Suíça', referencia)).toBeNull();
  });

  it('resolve por acento divergente e devolve o nome oficial acentuado (não a chave sem acento)', () => {
    expect(normalizarBairroDeterministico('belem', referencia)).toEqual({
      bairroId: 7,
      bairro: 'BELÉM',
      regionalId: LESTE,
    });
  });

  it('remove o sufixo "(Regional)" antes de tentar o lookup', () => {
    expect(
      normalizarBairroDeterministico('Diamante (Barreiro)', referencia),
    ).toEqual({
      bairroId: 2,
      bairro: 'DIAMANTE',
      regionalId: BARREIRO,
    });
  });

  it('colapsa a duplicação "X - X" antes de tentar o lookup', () => {
    expect(
      normalizarBairroDeterministico('Buritis - Buritis', referencia),
    ).toEqual({
      bairroId: 3,
      bairro: 'BURITIS',
      regionalId: OESTE,
    });
  });

  it('tenta o primeiro segmento de "X - Y"', () => {
    expect(
      normalizarBairroDeterministico('Savassi - Centro-Sul', referencia),
    ).toEqual({
      bairroId: 1,
      bairro: 'SAVASSI',
      regionalId: CENTRO_SUL,
    });
  });

  it('retorna null para bairro de outro município (nunca vai bater, é esperado)', () => {
    expect(normalizarBairroDeterministico('Nova Lima', referencia)).toBeNull();
  });

  it('retorna null para lixo de extração', () => {
    expect(normalizarBairroDeterministico('457', referencia)).toBeNull();
  });

  it('retorna null para string vazia', () => {
    expect(normalizarBairroDeterministico('', referencia)).toBeNull();
  });
});
