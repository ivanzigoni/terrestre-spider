import type { CheerioAPI } from 'cheerio';

/**
 * Cliente compartilhado para o cluster de 8 imobiliárias sobre o mesmo template de
 * site-building (CDN `cdn.loftsites.com.br`/`loft-analytics.gtmcapital.com.br`,
 * confirmado em `discovery/independentes-diagnostico.md`, Achado 3, e no lote 3 de
 * `.claude/__workdir/integracao-lote/lotes.md`) — sem API, listagem e detalhe
 * renderizados 100% no HTML inicial.
 *
 * A pipeline não estrutura mais dado de anúncio (ver refactor que remove
 * `RawListingItem`) — o único papel deste cliente hoje é descobrir os links de cada
 * imóvel via sitemap, para a fase de detalhe capturar o HTML bruto (ver
 * `loft-sites-router.ts`).
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
