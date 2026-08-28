import { describe, expect, it } from 'vitest';

import { OrigemAnuncio } from '../persistence/enums/origem-anuncio.enum.js';
import { TipoTransacao } from '../persistence/enums/tipo-transacao.enum.js';
import { loadStartUrls } from './search-urls.js';

// Três categorias de fonte não têm URL de busca em HTML e nunca chamam loadStartUrls de
// verdade, cada uma por um motivo diferente: clusters Imoview e Kenlo resolvem/montam a
// URL de busca dinamicamente via API própria (src/sources/shared/imoview-client.ts,
// src/sources/shared/kenlo-client.ts); clusters/fontes com descoberta via sitemap fixo
// (Loft Sites, ImobiBrasil, GSA Ativos, Imobiliária Pampulha) não têm busca por
// cidade/transação nenhuma (src/sources/shared/sitemap-client.ts); Chave Certa Imóveis
// BH (Tecimob) é uma única listagem paginada sem variação de tipoTransacao na URL
// (src/sources/chave-certa-imoveis-bh/client.ts). Excluídas do parametrizado abaixo,
// cobertas à parte.
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
  OrigemAnuncio.CASA_PAMPULHA_IMOVEIS,
  OrigemAnuncio.HABITAR_PAMPULHA,
  OrigemAnuncio.MODELO_IMOVEL,
  OrigemAnuncio.PRIMER_IMOVEIS,
  OrigemAnuncio.REAL_IMOVEIS_PAMPULHA,
  OrigemAnuncio.SEVEN_IMOVEIS,
  OrigemAnuncio.TOPMIG_IMOVEIS,
  OrigemAnuncio.VENDA_NOVA_IMOVEIS,
  OrigemAnuncio.LIMA_IMOVEIS_BARREIRO,
  OrigemAnuncio.STRUTURAL_IMOBILIARIA,
  OrigemAnuncio.GSA_ATIVOS,
  OrigemAnuncio.IMOBILIARIA_PAMPULHA,
  OrigemAnuncio.CHAVE_CERTA_IMOVEIS_BH,
  OrigemAnuncio.STILO_NETIMOVEIS,
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
