import { z } from 'zod';

import type { AnuncioNormalizado, Parser } from '../anuncio-normalizado.js';
import { extractRscObject } from './shared/rsc-next.js';
import { parseMoneyToCents } from './shared/money.js';

const priceBlockSchema = z
  .object({
    value: z.number().nullable(),
    condominium: z.number().nullable(),
    iptu: z.number().nullable(),
  })
  .nullable();

const listingSchema = z.object({
  id: z.union([z.string(), z.number()]),
  business: z.string(),
  prices: z.object({
    rental: priceBlockSchema,
    sale: priceBlockSchema,
  }),
  address: z.object({
    street: z.string().nullable(),
    streetNumber: z.string().nullable(),
    neighborhood: z.string().nullable(),
    city: z.string().nullable(),
    stateAcronym: z.string().nullable(),
    coordinates: z
      .object({
        latitude: z.number().nullable(),
        longitude: z.number().nullable(),
      })
      .nullable(),
  }),
  amenities: z.object({
    usableAreas: z.array(z.number()).nullable(),
    bedrooms: z.array(z.number()).nullable(),
    bathrooms: z.array(z.number()).nullable(),
    suites: z.array(z.number()).nullable(),
    parkingSpaces: z.array(z.number()).nullable(),
  }),
  description: z.string().nullable(),
  advertiser: z
    .object({
      name: z.string().nullable(),
      license: z.string().nullable(),
    })
    .nullable(),
});

function nonEmptyOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function firstOrNull(values: readonly number[] | null): number | null {
  if (values === null || values.length === 0) return null;
  return values[0] ?? null;
}

function parseListingRsc(html: string): AnuncioNormalizado {
  const rawListing = extractRscObject(html, 'listing');
  const result = listingSchema.safeParse(rawListing);
  if (!result.success) {
    throw new Error(
      `Grupo ZAP: formato inesperado no objeto "listing" (${result.error.message})`,
    );
  }

  const listing = result.data;
  const isAluguel = listing.business.toUpperCase() === 'RENTAL';
  const activeBlock = isAluguel ? listing.prices.rental : listing.prices.sale;

  const precoCents = parseMoneyToCents(activeBlock?.value ?? null);
  const condominioCents = parseMoneyToCents(activeBlock?.condominium ?? null);
  const iptuCents = parseMoneyToCents(activeBlock?.iptu ?? null);

  return {
    codigoExterno: String(listing.id),
    precoVenda: isAluguel ? null : precoCents,
    precoAluguel: isAluguel ? precoCents : null,
    disponivelAluguel: isAluguel,
    disponivelVenda: !isAluguel,
    condominio: condominioCents,
    iptu: iptuCents,
    area: firstOrNull(listing.amenities.usableAreas),
    quartos: firstOrNull(listing.amenities.bedrooms),
    suites: firstOrNull(listing.amenities.suites),
    banheiros: firstOrNull(listing.amenities.bathrooms),
    vagas: firstOrNull(listing.amenities.parkingSpaces),
    tipoImovelBruto: null,
    bairro: nonEmptyOrNull(listing.address.neighborhood),
    cidade: nonEmptyOrNull(listing.address.city),
    estado: nonEmptyOrNull(listing.address.stateAcronym),
    cep: null,
    endereco: nonEmptyOrNull(listing.address.street),
    numero: nonEmptyOrNull(listing.address.streetNumber),
    latitude: listing.address.coordinates?.latitude ?? null,
    longitude: listing.address.coordinates?.longitude ?? null,
    descricao: nonEmptyOrNull(listing.description),
    anuncianteNome: nonEmptyOrNull(listing.advertiser?.name),
    codigoCreci: nonEmptyOrNull(listing.advertiser?.license),
    publicadoEm: null,
    atualizadoEm: null,
  };
}

export const parseVivaReal: Parser = (conteudo: string): AnuncioNormalizado =>
  parseListingRsc(conteudo);

export const parseZapImoveis: Parser = (conteudo: string): AnuncioNormalizado =>
  parseListingRsc(conteudo);
