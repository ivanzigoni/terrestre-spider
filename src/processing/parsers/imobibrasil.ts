import { load } from 'cheerio';
import { z } from 'zod';

import type { AnuncioNormalizado, Parser } from '../anuncio-normalizado.js';
import { parseMoneyToCents } from './shared/money.js';

type CheerioDocument = ReturnType<typeof load>;

const ldJsonEnvelopeSchema = z.object({ '@type': z.string() }).loose();

const ldJsonAddressSchema = z
  .object({
    addressLocality: z.string().optional(),
    addressRegion: z.string().optional(),
  })
  .loose();

const buyActionSchema = z
  .object({
    '@type': z.literal('BuyAction'),
    price: z.string().optional(),
    object: z
      .object({
        address: ldJsonAddressSchema.optional(),
        name: z.string().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

const productSchema = z
  .object({
    '@type': z.literal('Product'),
    sku: z.string().optional(),
    mpn: z.string().optional(),
    name: z.string().optional(),
    offers: z
      .object({
        price: z.string().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

const breadcrumbItemSchema = z
  .object({
    position: z.number(),
    item: z.object({ name: z.string() }).loose(),
  })
  .loose();

const breadcrumbListSchema = z
  .object({
    '@type': z.literal('BreadcrumbList'),
    itemListElement: z.array(breadcrumbItemSchema),
  })
  .loose();

type BuyAction = z.infer<typeof buyActionSchema>;
type Product = z.infer<typeof productSchema>;
type BreadcrumbList = z.infer<typeof breadcrumbListSchema>;

const ALUGUEL_SIGNAL = /alugu|loca[cç][aã]o/i;
const AREA_LABEL_PRIORITY = ['area total', 'area util', 'area construida'];
const COMBINING_DIACRITICS = /[\u0300-\u036f]/g;
const TRAILING_LABEL_COLON = /:\s*$/;
const TIPO_FINALIDADE_SUFFIX = / para (venda|aluguel)$/i;
const BREADCRUMB_TIPO_POSITION = 4;

function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .trim();
}

function nonEmptyOrNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function parseAreaValue(raw: string): number | null {
  const digitsOnly = raw.replace(/[^\d,.-]/g, '').replace(',', '.');
  if (digitsOnly === '') return null;
  const parsed = Number(digitsOnly);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntegerOrNull(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const parsed = Number(raw.trim());
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function parseMoneyEntryOrNull(raw: string | undefined): number | null {
  return raw === undefined ? null : parseMoneyToCents(raw);
}

function extractLdJsonBlocks(html: string): unknown[] {
  const $ = load(html);
  const blocks: unknown[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).contents().text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      const detail =
        parseError instanceof Error ? parseError.message : String(parseError);
      throw new Error(
        `bloco ld+json da ImobiBrasil não é JSON válido: ${detail}`,
      );
    }
    blocks.push(parsed);
  });

  return blocks;
}

function findBlockByType(blocks: unknown[], type: string): unknown {
  for (const block of blocks) {
    const result = ldJsonEnvelopeSchema.safeParse(block);
    if (result.success && result.data['@type'] === type) return block;
  }
  return undefined;
}

function extractBuyAction(blocks: unknown[]): BuyAction {
  const block = findBlockByType(blocks, 'BuyAction');
  if (block === undefined) {
    throw new Error(
      'bloco ld+json "BuyAction" não encontrado no HTML da ImobiBrasil',
    );
  }
  return buyActionSchema.parse(block);
}

function extractProduct(blocks: unknown[]): Product {
  const block = findBlockByType(blocks, 'Product');
  if (block === undefined) {
    throw new Error(
      'bloco ld+json "Product" não encontrado no HTML da ImobiBrasil',
    );
  }
  return productSchema.parse(block);
}

function extractBreadcrumbList(blocks: unknown[]): BreadcrumbList | null {
  const block = findBlockByType(blocks, 'BreadcrumbList');
  return block === undefined ? null : breadcrumbListSchema.parse(block);
}

function resolveTipoImovelBruto(
  breadcrumb: BreadcrumbList | null,
): string | null {
  if (breadcrumb === null) return null;
  const tipoItem = breadcrumb.itemListElement.find(
    (entry) => entry.position === BREADCRUMB_TIPO_POSITION,
  );
  if (tipoItem === undefined) return null;
  const cleaned = tipoItem.item.name.replace(TIPO_FINALIDADE_SUFFIX, '').trim();
  return cleaned === '' ? null : cleaned;
}

function isAluguel(...corpusParts: (string | undefined)[]): boolean {
  const corpus = corpusParts
    .filter((part): part is string => part !== undefined)
    .join(' ');
  return ALUGUEL_SIGNAL.test(corpus);
}

function resolvePrecoFromDom($: CheerioDocument): number | null {
  const text = $('#info__valor').first().text().trim();
  return text === '' ? null : parseMoneyToCents(text);
}

function resolvePrecoCents(
  $: CheerioDocument,
  buyAction: BuyAction,
  product: Product,
): number | null {
  const domPrice = resolvePrecoFromDom($);
  if (domPrice !== null) return domPrice;
  if (product.offers?.price !== undefined)
    return parseMoneyToCents(product.offers.price);
  return buyAction.price === undefined
    ? null
    : parseMoneyToCents(buyAction.price);
}

function parseInfoTagEntries($: CheerioDocument): Map<string, string> {
  const entries = new Map<string, string>();

  $('.info__row > .info__tag').each((_, tagEl) => {
    const $tag = $(tagEl);
    const paragraphs = $tag.find('> p');
    const firstP = paragraphs.eq(0);
    const secondP = paragraphs.eq(1);
    if (secondP.length === 0) return;

    const value = secondP.find('b').first().text().trim();
    const firstLabel = firstP.text().trim();
    const label =
      firstLabel !== ''
        ? firstLabel
        : secondP.clone().find('b').remove().end().text().trim();

    if (label !== '') entries.set(normalizeLabel(label), value);
  });

  return entries;
}

function parseDescTagEntries($: CheerioDocument): Map<string, string> {
  const entries = new Map<string, string>();

  $('#desc_tags > p').each((_, pEl) => {
    const $p = $(pEl);
    const $b = $p.find('b').first();
    if ($b.length === 0) return;

    const label = $p
      .clone()
      .find('b')
      .remove()
      .end()
      .text()
      .replace(TRAILING_LABEL_COLON, '')
      .trim();
    if (label === '') return;

    const anchor = $b.find('a.bp-lkbairro').first();
    const value =
      anchor.length > 0
        ? anchor.clone().find('span').remove().end().text().trim()
        : $b.clone().find('style').remove().end().text().trim();

    entries.set(normalizeLabel(label), value);
  });

  return entries;
}

function findEntryByPrefix(
  entries: Map<string, string>,
  prefixes: string[],
): string | undefined {
  for (const [label, value] of entries) {
    if (prefixes.some((prefix) => label.startsWith(prefix))) return value;
  }
  return undefined;
}

function resolveArea(descTags: Map<string, string>): number | null {
  for (const label of AREA_LABEL_PRIORITY) {
    const raw = descTags.get(label);
    if (raw !== undefined) {
      const parsed = parseAreaValue(raw);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function resolveCodigoExterno(
  descTags: Map<string, string>,
  product: Product,
): string {
  const domCodigo = nonEmptyOrNull(descTags.get('codigo'));
  if (domCodigo !== null) return domCodigo;

  const fallback = nonEmptyOrNull(product.sku) ?? nonEmptyOrNull(product.mpn);
  if (fallback === null) {
    throw new Error(
      'código do imóvel não encontrado nem no DOM nem no ld+json Product da ImobiBrasil',
    );
  }
  return fallback;
}

function resolveDescricao($: CheerioDocument): string | null {
  const paragraph = $('#desc_descricao > p').first();
  const descricao = paragraph
    .clone()
    .find('style')
    .remove()
    .end()
    .text()
    .replace(/\s+/g, ' ')
    .trim();
  return descricao === '' ? null : descricao;
}

export const parseImobiBrasil: Parser = (
  conteudo: string,
): AnuncioNormalizado => {
  const $ = load(conteudo);
  const blocks = extractLdJsonBlocks(conteudo);
  const buyAction = extractBuyAction(blocks);
  const product = extractProduct(blocks);
  const breadcrumb = extractBreadcrumbList(blocks);

  const infoTags = parseInfoTagEntries($);
  const descTags = parseDescTagEntries($);

  const precoCents = resolvePrecoCents($, buyAction, product);
  const aluguel = isAluguel(buyAction.object?.name, product.name);

  return {
    codigoExterno: resolveCodigoExterno(descTags, product),
    precoVenda: aluguel ? null : precoCents,
    precoAluguel: aluguel ? precoCents : null,
    disponivelAluguel: aluguel,
    disponivelVenda: !aluguel,
    condominio: parseMoneyEntryOrNull(findEntryByPrefix(infoTags, ['condom'])),
    iptu: parseMoneyEntryOrNull(infoTags.get('iptu')),
    area: resolveArea(descTags),
    quartos: parseIntegerOrNull(findEntryByPrefix(infoTags, ['dormit'])),
    suites: parseIntegerOrNull(findEntryByPrefix(infoTags, ['suite'])),
    banheiros: parseIntegerOrNull(findEntryByPrefix(infoTags, ['banheiro'])),
    vagas: parseIntegerOrNull(findEntryByPrefix(infoTags, ['vaga'])),
    tipoImovelBruto: resolveTipoImovelBruto(breadcrumb),
    bairro: nonEmptyOrNull(descTags.get('bairro')),
    cidade: nonEmptyOrNull(buyAction.object?.address?.addressLocality),
    estado: nonEmptyOrNull(buyAction.object?.address?.addressRegion),
    cep: null,
    endereco: null,
    numero: null,
    latitude: null,
    longitude: null,
    descricao: resolveDescricao($),
    anuncianteNome: null,
    codigoCreci: null,
    publicadoEm: null,
    atualizadoEm: null,
  };
};
