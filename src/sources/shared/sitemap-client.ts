import type { CheerioAPI } from 'cheerio';

/**
 * Parsing de sitemap XML genérico (`<sitemapindex>`/`<urlset>`), sem lógica específica
 * de nenhum template. Reaproveitado por GTM Capital/Loft Sites e ImobiBrasil
 * (`discovery/independentes-diagnostico.md`, Achados 3-4, lotes 3-4 de
 * `.claude/__workdir/integracao-lote/lotes.md`) — ambos com sitemap sob `/imovel/` — e
 * por GSA Ativos (lote 5), cujo custom post type é `/imoveis/` (plural, WordPress
 * nativo em vez de Yoast). Já se chamou `loft-sites-client.ts`, mas nunca teve lógica
 * exclusiva daquele template — só fazia sentido renomear quando um segundo cluster
 * passou a reaproveitar o arquivo.
 */

const DEFAULT_PATH_PREFIX = '/imovel/';

export function parseSitemapIndex($: CheerioAPI): string[] {
  const urls = new Set<string>();
  $('loc').each((_, el) => {
    const texto = $(el).text().trim();
    if (texto.endsWith('.xml')) {
      urls.add(texto);
    }
  });
  return [...urls];
}

export interface SitemapUrlEntry {
  url: string;
  lastmod: string | null;
}

export function parseSitemapUrls(
  $: CheerioAPI,
  pathPrefix: string = DEFAULT_PATH_PREFIX,
): SitemapUrlEntry[] {
  const porUrl = new Map<string, string | null>();
  $('url').each((_, el) => {
    const loc = $(el).find('loc').first().text().trim();
    if (loc === '' || !new URL(loc).pathname.startsWith(pathPrefix)) {
      return;
    }
    const lastmodTexto = $(el).find('lastmod').first().text().trim();
    porUrl.set(loc, lastmodTexto === '' ? null : lastmodTexto);
  });
  return [...porUrl].map(([url, lastmod]) => ({ url, lastmod }));
}
