import { describe, expect, it } from 'vitest';

import { parseMoneyToCents } from './money.js';

describe('parseMoneyToCents', () => {
  it('interpreta ponto como separador de milhar quando não há vírgula', () => {
    expect(parseMoneyToCents('R$ 1.100')).toBe(110000);
    expect(parseMoneyToCents('R$ 4.630')).toBe(463000);
    expect(parseMoneyToCents('1.234.567')).toBe(123456700);
  });

  it('interpreta vírgula como separador decimal', () => {
    expect(parseMoneyToCents('R$ 1.100,50')).toBe(110050);
    expect(parseMoneyToCents('R$ 0,02')).toBe(2);
  });

  it('interpreta ponto como decimal quando o grupo final não tem 3 dígitos', () => {
    expect(parseMoneyToCents('0.02')).toBe(2);
    expect(parseMoneyToCents('3800.50')).toBe(380050);
  });

  it('aceita number diretamente, em reais', () => {
    expect(parseMoneyToCents(1100000)).toBe(110000000);
    expect(parseMoneyToCents(0.02)).toBe(2);
  });

  it('trata valores ausentes/inválidos como null', () => {
    expect(parseMoneyToCents(null)).toBeNull();
    expect(parseMoneyToCents(undefined)).toBeNull();
    expect(parseMoneyToCents('')).toBeNull();
    expect(parseMoneyToCents('Não informado')).toBeNull();
  });
});
