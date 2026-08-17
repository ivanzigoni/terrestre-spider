import { describe, expect, it } from 'vitest';

import { OrigemAnuncio } from '../persistence/enums/origem-anuncio.enum.js';
import { loadStartUrls } from './search-urls.js';

describe('loadStartUrls', () => {
  it.each(Object.values(OrigemAnuncio))(
    'retorna ao menos uma URL de busca para a fonte "%s"',
    async (fonte) => {
      const urls = await loadStartUrls(fonte);

      expect(Array.isArray(urls)).toBe(true);
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) {
        expect(() => new URL(url)).not.toThrow();
      }
    },
  );
});
