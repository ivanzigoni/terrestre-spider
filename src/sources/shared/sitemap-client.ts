import type { CheerioAPI } from 'cheerio';

/**
 * Parsing de sitemap XML genérico (`<sitemapindex>`/`<urlset>`), sem lógica específica
 * de nenhum template — filtra só por path `/imovel/`, convenção comum aos dois clusters
 * que hoje descobrem links via sitemap: GTM Capital/Loft Sites
 * (`discovery/independentes-diagnostico.md`, Achado 3, lote 3 de
 * `.claude/__workdir/integracao-lote/lotes.md`) e ImobiBrasil (Achado 4, lote 4). Já se
 * chamou `loft-sites-client.ts`, mas nunca teve lógica exclusiva daquele template — só
 * fazia sentido renomear quando um segundo cluster passou a reaproveitar o arquivo.
 */

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

export function parseSitemapUrls($: CheerioAPI): SitemapUrlEntry[] {
  const porUrl = new Map<string, string | null>();
  $('url').each((_, el) => {
    const loc = $(el).find('loc').first().text().trim();
    if (loc === '' || !new URL(loc).pathname.startsWith('/imovel/')) {
      return;
    }
    const lastmodTexto = $(el).find('lastmod').first().text().trim();
    porUrl.set(loc, lastmodTexto === '' ? null : lastmodTexto);
  });
  return [...porUrl].map(([url, lastmod]) => ({ url, lastmod }));
}
