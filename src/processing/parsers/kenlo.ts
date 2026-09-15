import { z } from 'zod';

import type { AnuncioNormalizado, Parser } from '../anuncio-normalizado.js';
import { parseMoneyToCents } from './shared/money.js';

const kenloBrokerSchema = z
  .object({
    broker_name: z.string().optional(),
    broker_credential: z.string().optional(),
  })
  .loose();

const kenloListingSchema = z
  .object({
    property_reference: z.string().min(1),
    bathrooms: z.array(z.number()).optional(),
    bedrooms: z.array(z.number()).optional(),
    garages: z.array(z.number()).optional(),
    suites: z.array(z.number()).optional(),
    area: z.array(z.number()).optional(),
    rent_price: z.array(z.number()).optional(),
    sale_price: z.array(z.number()).optional(),
    property_tax: z.number().optional(),
    condo_fees: z.number().optional(),
    property_type: z.string().optional(),
    neighborhood: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    listing_description: z.string().optional(),
    updated_at: z.string().optional(),
    listing_owner_name: z.string().optional(),
    brokers: z.array(kenloBrokerSchema).optional(),
  })
  .loose();

type KenloListing = z.infer<typeof kenloListingSchema>;

const LISTING_ARRAY_MARKER = '"listing":[';

function findBalancedArray(text: string, arrayStart: number): string {
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = arrayStart; i < text.length; i++) {
    const char = text[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '[') depth++;
    else if (char === ']') {
      depth--;
      if (depth === 0) return text.slice(arrayStart, i + 1);
    }
  }

  throw new Error(
    `array "listing" a partir da posição ${String(arrayStart)} não fechou corretamente`,
  );
}

function extractKenloListing(html: string): KenloListing {
  const markerStart = html.indexOf(LISTING_ARRAY_MARKER);
  if (markerStart === -1) {
    throw new Error('chave "listing" não encontrada no HTML da Kenlo');
  }

  const arrayStart = markerStart + '"listing":'.length;
  const arrayText = findBalancedArray(html, arrayStart);
  const parsedArray: unknown = JSON.parse(arrayText);
  const listingArray = z.array(z.unknown()).min(1).parse(parsedArray);
  return kenloListingSchema.parse(listingArray[0]);
}

function firstDecimalElement(values: number[] | undefined): number | null {
  if (values === undefined || values.length === 0) return null;
  const first = values[0];
  return first !== undefined && Number.isFinite(first) ? first : null;
}

function firstIntegerElement(values: number[] | undefined): number | null {
  const decimal = firstDecimalElement(values);
  return decimal === null ? null : Math.trunc(decimal);
}

function resolveMoneyOrNull(value: number | null | undefined): number | null {
  return value === undefined || value === null
    ? null
    : parseMoneyToCents(value);
}

// Preço de venda/aluguel exatamente 0 significa "não se aplica a essa
// transação" (ex.: imóvel só de aluguel tem sale_price [0,0]), nunca um
// imóvel gratuito — diferente de condomínio/IPTU, onde 0 pode ser isenção
// real.
function resolvePriceOrNull(value: number | null | undefined): number | null {
  const cents = resolveMoneyOrNull(value);
  return cents === 0 ? null : cents;
}

function resolveDatetimeOrNull(value: string | undefined): Date | null {
  if (value === undefined) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function nonEmptyOrNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function resolveCodigoCreci(brokers: KenloListing['brokers']): string | null {
  const primeiro = brokers?.[0];
  return nonEmptyOrNull(primeiro?.broker_credential);
}

export const parseKenlo: Parser = (conteudo: string): AnuncioNormalizado => {
  const listing = extractKenloListing(conteudo);

  return {
    codigoExterno: listing.property_reference,
    precoVenda: resolvePriceOrNull(firstDecimalElement(listing.sale_price)),
    precoAluguel: resolvePriceOrNull(firstDecimalElement(listing.rent_price)),
    condominio: resolveMoneyOrNull(listing.condo_fees),
    iptu: resolveMoneyOrNull(listing.property_tax),
    area: firstDecimalElement(listing.area),
    quartos: firstIntegerElement(listing.bedrooms),
    suites: firstIntegerElement(listing.suites),
    banheiros: firstIntegerElement(listing.bathrooms),
    vagas: firstIntegerElement(listing.garages),
    tipoImovelBruto: nonEmptyOrNull(listing.property_type),
    bairro: nonEmptyOrNull(listing.neighborhood),
    cidade: nonEmptyOrNull(listing.city),
    estado: nonEmptyOrNull(listing.state),
    cep: null,
    endereco: null,
    numero: null,
    latitude: null,
    longitude: null,
    descricao: nonEmptyOrNull(listing.listing_description),
    anuncianteNome: nonEmptyOrNull(listing.listing_owner_name),
    codigoCreci: resolveCodigoCreci(listing.brokers),
    publicadoEm: null,
    atualizadoEm: resolveDatetimeOrNull(listing.updated_at),
  };
};
