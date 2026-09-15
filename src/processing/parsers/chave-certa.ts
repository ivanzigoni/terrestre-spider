import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { z } from 'zod';

import type { AnuncioNormalizado, Parser } from '../anuncio-normalizado.js';
import { parseMoneyToCents } from './shared/money.js';

const realEstateAddressSchema = z.object({
  addressLocality: z.string().nullable().optional(),
});

const realEstateItemOfferedSchema = z.object({
  address: realEstateAddressSchema.nullable().optional(),
  numberOfBedrooms: z.number().nullable().optional(),
  numberOfBathroomsTotal: z.number().nullable().optional(),
});

const realEstateSellerSchema = z.object({
  name: z.string().nullable().optional(),
  identifier: z.string().nullable().optional(),
});

const realEstateOffersSchema = z.object({
  price: z.number().nullable().optional(),
  category: z.string().nullable().optional(),
  itemOffered: realEstateItemOfferedSchema.nullable().optional(),
  seller: realEstateSellerSchema.nullable().optional(),
});

const realEstateListingSchema = z.object({
  '@type': z.literal('RealEstateListing'),
  name: z.string().nullable().optional(),
  identifier: z.string().nullable().optional(),
  datePosted: z.string().nullable().optional(),
  offers: realEstateOffersSchema.nullable().optional(),
});

type RealEstateListing = z.infer<typeof realEstateListingSchema>;

function nonEmptyOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().normalize('NFC');
  return trimmed === '' ? null : trimmed;
}

function parseFirstDecimal(value: string): number | null {
  const captured = /(\d+(?:[.,]\d+)?)/.exec(value)?.[1];
  if (captured === undefined) return null;
  const parsed = Number(captured.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function tentarParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractRealEstateListing($: CheerioAPI): RealEstateListing | null {
  for (const script of $('script[type="application/ld+json"]').toArray()) {
    const parsed = tentarParseJson($(script).contents().text());
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      continue;
    if ((parsed as Record<string, unknown>)['@type'] !== 'RealEstateListing')
      continue;

    const result = realEstateListingSchema.safeParse(parsed);
    if (result.success) return result.data;
  }
  return null;
}

function extractCodigoExternoFallback($: CheerioAPI): string | null {
  const match = /Ref\.?:?\s*(\d+)/i.exec($('body').text());
  return match?.[1] ?? null;
}

function extractAreaConstruida($: CheerioAPI): number | null {
  let area: number | null = null;
  $('span.Line_title').each((_index, el) => {
    if ($(el).text().trim() !== 'Área Construída') return;
    area = parseFirstDecimal($(el).next('span.Line_value').text());
  });
  return area;
}

function isAluguelCategoria(categoria: string | null | undefined): boolean {
  if (categoria === null || categoria === undefined) return false;
  const normalizado = categoria.toLowerCase();
  return normalizado.includes('forrent') || normalizado.includes('rent');
}

interface CidadeEstado {
  cidade: string | null;
  estado: string | null;
}

function splitCidadeEstadoDoNome(
  nome: string | null | undefined,
): CidadeEstado {
  if (nome === null || nome === undefined)
    return { cidade: null, estado: null };

  const trimmed = nome.trim();
  const barraIndex = trimmed.lastIndexOf('/');
  if (barraIndex === -1) return { cidade: null, estado: null };

  const estado = trimmed.slice(barraIndex + 1).trim();
  if (estado.length !== 2) return { cidade: null, estado: null };

  const antesBarra = trimmed.slice(0, barraIndex);
  const virgulaIndex = antesBarra.lastIndexOf(',');
  if (virgulaIndex === -1)
    return { cidade: null, estado: nonEmptyOrNull(estado) };

  const cidade = antesBarra.slice(virgulaIndex + 1).trim();
  return { cidade: nonEmptyOrNull(cidade), estado: nonEmptyOrNull(estado) };
}

export const parseChaveCerta: Parser = (
  conteudo: string,
): AnuncioNormalizado => {
  const $ = load(conteudo);

  const listing = extractRealEstateListing($);
  if (listing === null) {
    throw new Error(
      'ChaveCerta: bloco ld+json do tipo "RealEstateListing" não encontrado no HTML',
    );
  }

  const codigoExterno =
    nonEmptyOrNull(listing.identifier) ?? extractCodigoExternoFallback($);
  if (codigoExterno === null) {
    throw new Error(
      'ChaveCerta: não foi possível determinar o código do imóvel (nem "identifier" no ld+json, nem "Ref.: N" no HTML)',
    );
  }

  const offers = listing.offers ?? null;
  const isAluguel = isAluguelCategoria(offers?.category);
  const precoCentavos = parseMoneyToCents(offers?.price ?? null);

  const { cidade, estado } = splitCidadeEstadoDoNome(listing.name);

  return {
    codigoExterno,
    precoVenda: isAluguel ? null : precoCentavos,
    precoAluguel: isAluguel ? precoCentavos : null,
    disponivelAluguel: isAluguel,
    disponivelVenda: !isAluguel,
    condominio: null,
    iptu: null,
    area: extractAreaConstruida($),
    quartos: offers?.itemOffered?.numberOfBedrooms ?? null,
    suites: null,
    banheiros: offers?.itemOffered?.numberOfBathroomsTotal ?? null,
    vagas: null,
    tipoImovelBruto: null,
    bairro: nonEmptyOrNull(offers?.itemOffered?.address?.addressLocality),
    cidade,
    estado,
    cep: null,
    endereco: null,
    numero: null,
    latitude: null,
    longitude: null,
    descricao: null,
    anuncianteNome: nonEmptyOrNull(offers?.seller?.name),
    codigoCreci: nonEmptyOrNull(offers?.seller?.identifier),
    publicadoEm: parseDate(listing.datePosted),
    atualizadoEm: null,
  };
};
