import { describe, expect, it } from 'vitest';

import { OrigemAnuncio } from '../persistence/enums/origem-anuncio.enum.js';
import { TipoTransacao } from '../persistence/enums/tipo-transacao.enum.js';
import { loadStartUrls } from './search-urls.js';

// Fontes baseadas em API (clusters Imoview e Kenlo) não têm URL de busca em HTML —
// resolvem/montam a URL de busca dinamicamente (src/sources/shared/imoview-client.ts,
// src/sources/shared/kenlo-client.ts) e nunca chamam loadStartUrls de verdade. Excluídas
// do parametrizado abaixo, cobertas à parte.
const FONTES_SEM_SEARCH_URLS = new Set<OrigemAnuncio>([
  OrigemAnuncio.IMOBILIARIA_BURITIS,
  OrigemAnuncio.LIDERAR_IMOVEIS,
  OrigemAnuncio.CASA_GRANDE_IMOVEIS,
  OrigemAnuncio.ADIMOVEIS_BH,
  OrigemAnuncio.DIEGO_GARCIA_IMOVEIS,
  OrigemAnuncio.VALORE_IMOVEIS,
  OrigemAnuncio.IVI_INVISTA_IMOVEIS,
  OrigemAnuncio.REAL_IMOBILIARIA,
  OrigemAnuncio.JMC_IMOVEIS,
  OrigemAnuncio.LUXUS_IMOVEIS_PREMIUM,
]);

const FONTES_COM_SEARCH_URLS = Object.values(OrigemAnuncio).filter(
  (fonte) => !FONTES_SEM_SEARCH_URLS.has(fonte),
);

describe('loadStartUrls', () => {
  it.each(FONTES_COM_SEARCH_URLS)(
    'retorna URLs de aluguel e venda para a fonte "%s"',
    async (fonte) => {
      const entries = await loadStartUrls(fonte);

      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeGreaterThan(0);

      const tiposEncontrados = new Set(
        entries.map((entry) => entry.tipoTransacao),
      );
      expect(tiposEncontrados.has(TipoTransacao.ALUGUEL)).toBe(true);
      expect(tiposEncontrados.has(TipoTransacao.VENDA)).toBe(true);

      for (const entry of entries) {
        expect(() => new URL(entry.url)).not.toThrow();
      }
    },
  );

  it.each([...FONTES_SEM_SEARCH_URLS])(
    'rejeita a fonte baseada em API "%s" (sem URLs de busca HTML)',
    async (fonte) => {
      await expect(loadStartUrls(fonte)).rejects.toThrow(
        'não usa search-urls.json',
      );
    },
  );
});
