import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import { parseSitemapIndex, parseSitemapUrls } from './loft-sites-client.js';

describe('parseSitemapIndex', () => {
  it('extrai só as <loc> terminadas em .xml, sem duplicar', () => {
    const xml = `
      <sitemapindex>
        <sitemap><loc>https://exemplo.com.br/sitemaps/general.xml</loc></sitemap>
        <sitemap><loc>https://exemplo.com.br/sitemaps/imoveis-1.xml</loc></sitemap>
        <sitemap><loc>https://exemplo.com.br/sitemaps/imoveis-1.xml</loc></sitemap>
      </sitemapindex>
    `;
    const $ = load(xml, { xmlMode: true });
    const urls = parseSitemapIndex($);
    expect(urls).toEqual([
      'https://exemplo.com.br/sitemaps/general.xml',
      'https://exemplo.com.br/sitemaps/imoveis-1.xml',
    ]);
  });
});

describe('parseSitemapUrls', () => {
  it('extrai só URLs de /imovel/..., com lastmod, e ignora outras rotas', () => {
    const xml = `
      <urlset>
        <url>
          <loc>https://exemplo.com.br/imovel/casa-1</loc>
          <lastmod>2026-08-21T00:00:00.000Z</lastmod>
        </url>
        <url>
          <loc>https://exemplo.com.br/sobre-nos</loc>
        </url>
        <url>
          <loc>https://exemplo.com.br/imovel/casa-2</loc>
        </url>
      </urlset>
    `;
    const $ = load(xml, { xmlMode: true });
    const entries = parseSitemapUrls($);
    expect(entries).toEqual([
      {
        url: 'https://exemplo.com.br/imovel/casa-1',
        lastmod: '2026-08-21T00:00:00.000Z',
      },
      { url: 'https://exemplo.com.br/imovel/casa-2', lastmod: null },
    ]);
  });

  it('dedup por URL — mesma <loc> repetida conta uma vez só', () => {
    const xml = `
      <urlset>
        <url><loc>https://exemplo.com.br/imovel/casa-1</loc></url>
        <url><loc>https://exemplo.com.br/imovel/casa-1</loc></url>
      </urlset>
    `;
    const $ = load(xml, { xmlMode: true });
    expect(parseSitemapUrls($)).toHaveLength(1);
  });
});
