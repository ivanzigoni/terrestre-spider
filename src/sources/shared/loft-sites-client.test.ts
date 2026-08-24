import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import {
  parseListingDetailPage,
  parseSitemapIndex,
  parseSitemapUrls,
} from './loft-sites-client.js';

const URL_DETALHE = 'https://exemplo-loft.com.br/imovel/casa-exemplo-1234';

/**
 * Fixture mínima, moldada no markup real confirmado no lote 3 (ver
 * discovery/independentes-diagnostico.md, Achado 3, e
 * .claude/__workdir/integracao-lote/lotes.md) — rótulo de texto ("Valor venda"/"Valor
 * aluguel", "Banheiros" etc.) com o valor no elemento irmão, mais `<title>` (fonte
 * confirmada de `titulo`) e um bloco "bairro, cidade - UF" perto do preço (fonte de
 * `localizacao`).
 */
function buildRawHtml(
  overrides: {
    precoLabel?: string;
    precoValor?: string;
    extra?: string;
  } = {},
): string {
  const precoLabel = overrides.precoLabel ?? 'Valor venda';
  const precoValor = overrides.precoValor ?? 'R$ 850.000,00';
  const extra = overrides.extra ?? '';
  return `
    <html>
      <head><title>Casa à Venda com 3 Quartos em Trevo</title></head>
      <body>
        <h3>Trevo, Belo Horizonte - MG</h3>
        <div>
          <span>${precoLabel}</span>
          <span>${precoValor}</span>
        </div>
        <ul>
          <li><span>Quartos</span><span>3</span></li>
          <li><span>Banheiros</span><span>2</span></li>
          <li><span>Vagas</span><span>2</span></li>
          <li><span>Área total: </span><span>120m²</span></li>
          <li><span>Condomínio</span><span>R$ 350,00</span></li>
        </ul>
        ${extra}
      </body>
    </html>
  `;
}

function parse(html: string) {
  const $ = load(html);
  return parseListingDetailPage(
    $,
    URL_DETALHE,
    OrigemAnuncio.CASA_PAMPULHA_IMOVEIS,
  );
}

describe('parseListingDetailPage', () => {
  it('extrai um item de venda a partir do rótulo "Valor venda"', () => {
    const item = parse(buildRawHtml());
    expect(item?.tipoTransacao).toBe(TipoTransacao.VENDA);
    expect(item?.preco).toBe(850_000);
  });

  it('extrai um item de aluguel a partir do rótulo "Valor aluguel"', () => {
    const item = parse(
      buildRawHtml({ precoLabel: 'Valor aluguel', precoValor: 'R$ 4.000,00' }),
    );
    expect(item?.tipoTransacao).toBe(TipoTransacao.ALUGUEL);
    expect(item?.preco).toBe(4000);
  });

  it('retorna null quando nem "Valor venda" nem "Valor aluguel" estão presentes (item malformado, não derruba a fase)', () => {
    const item = parse(buildRawHtml({ precoLabel: 'Preço sob consulta' }));
    expect(item).toBeNull();
  });

  it('não confunde o preço com Condomínio nem com um valor solto numa barra fixa sem rótulo (regressão: Primer Imóveis, achado do lote 3)', () => {
    // Condomínio aparece ANTES do rótulo "Valor aluguel" no DOM, e um terceiro "R$"
    // solto (barra fixa/CTA, sem rótulo algum) aparece depois — o parser tem que
    // ignorar os dois e usar só o valor ancorado no rótulo "Valor aluguel".
    const html = `
      <html>
        <head><title>Apartamento 2 quartos - Anchieta</title></head>
        <body>
          <h3>Anchieta, Belo Horizonte - MG</h3>
          <div><span>Condomínio</span><span>R$ 548,00</span></div>
          <div><span>Valor aluguel</span><span>R$ 4.000,00</span></div>
          <div class="barra-fixa"><span>R$ 4.000,00</span></div>
        </body>
      </html>
    `;
    const $ = load(html);
    const item = parseListingDetailPage(
      $,
      URL_DETALHE,
      OrigemAnuncio.PRIMER_IMOVEIS,
    );
    expect(item?.tipoTransacao).toBe(TipoTransacao.ALUGUEL);
    expect(item?.preco).toBe(4000);
    expect(item?.condominio).toBe(548);
  });

  it('resolve rótulo e valor no mesmo nó de texto ("Banheiros: 2"), não só em nós irmãos separados', () => {
    const html = `
      <html>
        <head><title>Casa com banheiro inline</title></head>
        <body>
          <h3>Trevo, Belo Horizonte - MG</h3>
          <div><span>Valor venda</span><span>R$ 500.000,00</span></div>
          <li>Banheiros: 3</li>
        </body>
      </html>
    `;
    const $ = load(html);
    const item = parseListingDetailPage(
      $,
      URL_DETALHE,
      OrigemAnuncio.CASA_PAMPULHA_IMOVEIS,
    );
    expect(item?.banheiros).toBe(3);
  });

  it('resolve valor num elemento FILHO do próprio rótulo, não no <li> seguinte (regressão: Habitar Pampulha/Real Imóveis Pampulha, "Área Total <b>360m²</b>" no mesmo <span>, sem essa correção pegava o texto do próximo <li> de característica)', () => {
    const html = `
      <html>
        <head><title>Casa com área aninhada</title></head>
        <body>
          <h3>Trevo, Belo Horizonte - MG</h3>
          <div><span>Valor venda</span><span>R$ 500.000,00</span></div>
          <ul>
            <li><span>Área Total <b>360m²</b></span></li>
            <li><span>4 Dormitórios</span></li>
          </ul>
        </body>
      </html>
    `;
    const $ = load(html);
    const item = parseListingDetailPage(
      $,
      URL_DETALHE,
      OrigemAnuncio.HABITAR_PAMPULHA,
    );
    expect(item?.area).toBe(360);
  });

  it('resolve quartos/banheiros no padrão "número primeiro" (ícone + "<número> <rótulo>" no mesmo nó, sem rótulo antes do número — achado do lote 3 contra a lista de Características)', () => {
    const html = `
      <html>
        <head><title>Casa com características por ícone</title></head>
        <body>
          <h3>Trevo, Belo Horizonte - MG</h3>
          <div><span>Valor venda</span><span>R$ 500.000,00</span></div>
          <ul>
            <li><svg></svg><span>3 Dormitórios</span></li>
            <li><svg></svg><span>2 Banheiros</span></li>
          </ul>
        </body>
      </html>
    `;
    const $ = load(html);
    const item = parseListingDetailPage(
      $,
      URL_DETALHE,
      OrigemAnuncio.CASA_PAMPULHA_IMOVEIS,
    );
    expect(item?.quartos).toBe(3);
    expect(item?.banheiros).toBe(2);
  });

  it('campo ausente (ex.: lote/terreno sem "Quartos") não derruba o item — vira 0, não null', () => {
    const html = `
      <html>
        <head><title>Lote Plano 322m²</title></head>
        <body>
          <h3>Justinópolis, Ribeirão das Neves - MG</h3>
          <div><span>Valor venda</span><span>R$ 250.000,00</span></div>
        </body>
      </html>
    `;
    const $ = load(html);
    const item = parseListingDetailPage(
      $,
      URL_DETALHE,
      OrigemAnuncio.VENDA_NOVA_IMOVEIS,
    );
    expect(item).not.toBeNull();
    expect(item?.quartos).toBe(0);
  });

  it('parseia "R$ 1.999.999,00" para 1999999 (milhar com ponto, decimal com vírgula)', () => {
    const item = parse(buildRawHtml({ precoValor: 'R$ 1.999.999,00' }));
    expect(item?.preco).toBe(1_999_999);
  });

  it('descarta item cujo preço excede o teto do Postgres (temValorPlausivel reaproveitado, não reimplementado)', () => {
    const item = parse(buildRawHtml({ precoValor: 'R$ 3.650.000.000,00' }));
    expect(item).toBeNull();
  });

  it('localizacao vem do bairro perto do preço, não do primeiro card de um carrossel de imóveis similares mais acima no DOM (regressão real: Casa Pampulha)', () => {
    const html = `
      <html>
        <head><title>Casa com carrossel de similares</title></head>
        <body>
          <section>
            <h4>Imóveis similares</h4>
            <div>Santa Amélia, Belo Horizonte - MG</div>
          </section>
          <div>
            <h3>Trevo, Belo Horizonte - MG</h3>
            <span>Valor venda</span><span>R$ 850.000,00</span>
          </div>
        </body>
      </html>
    `;
    const $ = load(html);
    const item = parseListingDetailPage(
      $,
      URL_DETALHE,
      OrigemAnuncio.CASA_PAMPULHA_IMOVEIS,
    );
    expect(item?.localizacao).toBe('Trevo, Belo Horizonte - MG');
  });

  it('titulo vem de <title>, não de <h1> — h1 está ausente na maioria dos 8 sites testados no lote 3', () => {
    const item = parse(buildRawHtml());
    expect(item?.titulo).toBe('Casa à Venda com 3 Quartos em Trevo');
  });

  it('retorna null quando a página não tem <title> (sem titulo, campo obrigatório em RawListingItem)', () => {
    const html = `
      <html>
        <body>
          <h3>Trevo, Belo Horizonte - MG</h3>
          <div><span>Valor venda</span><span>R$ 500.000,00</span></div>
        </body>
      </html>
    `;
    const $ = load(html);
    const item = parseListingDetailPage(
      $,
      URL_DETALHE,
      OrigemAnuncio.CASA_PAMPULHA_IMOVEIS,
    );
    expect(item).toBeNull();
  });
});

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
