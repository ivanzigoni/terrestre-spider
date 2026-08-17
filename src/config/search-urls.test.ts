import { describe, expect, it } from 'vitest';

import { OrigemAnuncio } from '../persistence/enums/origem-anuncio.enum.js';
import { TipoTransacao } from '../persistence/enums/tipo-transacao.enum.js';
import { loadStartUrls } from './search-urls.js';

describe('loadStartUrls', () => {
  it.each(Object.values(OrigemAnuncio))(
    'retorna URLs de aluguel e venda para a fonte "%s"',
    async (fonte) => {
      const entries = await loadStartUrls(fonte);

      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeGreaterThan(0);

      const tiposEncontrados = new Set(
        entries.map((entry) => entry.transactionType),
      );
      expect(tiposEncontrados.has(TipoTransacao.ALUGUEL)).toBe(true);
      expect(tiposEncontrados.has(TipoTransacao.VENDA)).toBe(true);

      for (const entry of entries) {
        expect(() => new URL(entry.url)).not.toThrow();
      }
    },
  );
});
