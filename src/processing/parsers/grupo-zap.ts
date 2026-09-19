import { load } from 'cheerio';
import { z } from 'zod';

import type { AnuncioNormalizado, Parser } from '../anuncio-normalizado.js';
import { extractRscObject } from './shared/rsc-next.js';
import { parseMoneyToCents } from './shared/money.js';

// .nullish() (não só .nullable()) em cada campo descritivo abaixo: extractRscObject
// resolve o sentinel "$undefined" do protocolo RSC para `undefined` (ver rsc-next.ts),
// então qualquer um desses campos — ausente na fonte para aquele imóvel específico —
// pode chegar como `undefined`, não só como `null`. `id`/`business` ficam de fora de
// propósito: são a identidade e o tipo de negócio do anúncio, e devem seguir
// obrigatórios — um "$undefined" ali é falha real, não ausência de dado descritivo.
const priceBlockSchema = z
  .object({
    value: z.number().nullish(),
    condominium: z.number().nullish(),
    iptu: z.number().nullish(),
  })
  .nullish();

const listingSchema = z.object({
  id: z.union([z.string(), z.number()]),
  business: z.string(),
  prices: z.object({
    rental: priceBlockSchema,
    sale: priceBlockSchema,
  }),
  address: z.object({
    street: z.string().nullish(),
    streetNumber: z.string().nullish(),
    neighborhood: z.string().nullish(),
    city: z.string().nullish(),
    stateAcronym: z.string().nullish(),
    coordinates: z
      .object({
        latitude: z.number().nullish(),
        longitude: z.number().nullish(),
      })
      .nullish(),
  }),
  amenities: z.object({
    usableAreas: z.array(z.number()).nullish(),
    bedrooms: z.array(z.number()).nullish(),
    bathrooms: z.array(z.number()).nullish(),
    suites: z.array(z.number()).nullish(),
    parkingSpaces: z.array(z.number()).nullish(),
  }),
  description: z.string().nullish(),
  advertiser: z
    .object({
      name: z.string().nullish(),
      license: z.string().nullish(),
    })
    .nullish(),
});

function nonEmptyOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function firstOrNull(
  values: readonly number[] | null | undefined,
): number | null {
  if (values === null || values === undefined || values.length === 0) {
    return null;
  }
  return values[0] ?? null;
}

// og:image aponta pra mesma foto de capa do RSC (listing.images[0].dangerousSrc), mas
// já resolvida — o RSC vem com placeholders literais ({width}, {height} etc.) que
// exigiriam um passo extra de substituição.
function extractOgImage(html: string): string | null {
  const $ = load(html);
  return nonEmptyOrNull($('meta[name="og:image"]').attr('content'));
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
    imagemUrl: extractOgImage(html),
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
