import { describe, expect, it } from 'vitest';

import { aparar, normalizarEspacos } from './texto.js';

describe('aparar', () => {
  it('remove espaços, vírgulas, pontos, hífens, travessões e dois-pontos das bordas', () => {
    expect(aparar(' , – Bairro Centro. - ')).toBe('Bairro Centro');
  });

  it('preserva pontuação interna', () => {
    expect(aparar('R. Dr. Gonçalo de Moura')).toBe('R. Dr. Gonçalo de Moura');
  });

  it('retorna string vazia quando só há caracteres de borda', () => {
    expect(aparar(' - , . ')).toBe('');
  });
});

describe('normalizarEspacos', () => {
  it('colapsa sequências de espaço e quebras de linha', () => {
    expect(normalizarEspacos('  Rua   A\n\tB ')).toBe('Rua A B');
  });
});
