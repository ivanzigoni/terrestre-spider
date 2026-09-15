import { z } from 'zod';

import type { AnuncioNormalizado, Parser } from '../anuncio-normalizado.js';
import { parseMoneyToCents } from './shared/money.js';

const olxPropertySchema = z.object({
  name: z.string(),
  value: z.string().nullable(),
});

const olxPriceInfoEntrySchema = z.object({
  name: z.string(),
  value: z.string().nullable(),
});

const olxLocationSchema = z.object({
  address: z.string().nullable(),
  neighbourhood: z.string().nullable(),
  municipality: z.string().nullable(),
  uf: z.string().nullable(),
  zipcode: z.string().nullable(),
  mapLati: z.number().nullable(),
  mapLong: z.number().nullable(),
});

const olxUserSchema = z.object({
  name: z.string().nullable(),
});

const olxAdSchema = z.object({
  adId: z.union([z.string(), z.number()]),
  listId: z.union([z.string(), z.number()]),
  subject: z.string().nullable(),
  body: z.string().nullable(),
  priceLabel: z.string().nullable(),
  priceValue: z.string().nullable(),
  properties: z.array(olxPropertySchema),
  realEstatePriceInfo: z.array(olxPriceInfoEntrySchema).nullable(),
  location: olxLocationSchema,
  listTime: z.string().nullable(),
  user: olxUserSchema.nullable(),
});

const olxInitialDataSchema = z.object({
  ad: olxAdSchema,
});

type OlxProperty = z.infer<typeof olxPropertySchema>;
type OlxPriceInfoEntry = z.infer<typeof olxPriceInfoEntrySchema>;

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_match, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function extractInitialData(html: string): unknown {
  const match = /<script id="initial-data"[^>]*data-json="([^"]*)"/.exec(html);
  if (match === null) {
    throw new Error(
      'OLX: elemento script#initial-data com atributo data-json não encontrado no HTML',
    );
  }

  const attributeValue = match[1];
  if (attributeValue === undefined) {
    throw new Error(
      'OLX: atributo data-json vazio no elemento script#initial-data',
    );
  }

  const decoded = decodeHtmlEntities(attributeValue);
  try {
    return JSON.parse(decoded);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `OLX: falha ao fazer parse do JSON em data-json (${reason})`,
    );
  }
}

function nonEmptyOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function findPropertyValue(
  properties: readonly OlxProperty[],
  name: string,
): string | null {
  const found = properties.find((property) => property.name === name);
  return nonEmptyOrNull(found?.value);
}

function findPriceInfoValue(
  priceInfo: readonly OlxPriceInfoEntry[] | null,
  name: string,
): string | null {
  if (priceInfo === null) return null;
  const found = priceInfo.find((entry) => entry.name === name);
  return nonEmptyOrNull(found?.value);
}

function moneyOrNull(value: string | null): number | null {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === '' ||
    normalized === 'não informado' ||
    normalized === 'nao informado'
  ) {
    return null;
  }
  return parseMoneyToCents(value);
}

function parseFirstDecimal(value: string | null): number | null {
  if (value === null) return null;
  const captured = /(\d+(?:[.,]\d+)?)/.exec(value)?.[1];
  if (captured === undefined) return null;
  const parsed = Number(captured.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFirstInteger(value: string | null): number | null {
  if (value === null) return null;
  const captured = /(\d+)/.exec(value)?.[1];
  if (captured === undefined) return null;
  const parsed = Number.parseInt(captured, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: string | null): Date | null {
  if (value === null) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const parseOlx: Parser = (conteudo: string): AnuncioNormalizado => {
  const initialData = extractInitialData(conteudo);
  const result = olxInitialDataSchema.safeParse(initialData);
  if (!result.success) {
    throw new Error(
      `OLX: formato inesperado no objeto "ad" (${result.error.message})`,
    );
  }

  const { ad } = result.data;

  const isAluguel = (ad.priceLabel ?? '').toLowerCase().includes('aluguel');
  const priceCents = moneyOrNull(ad.priceValue);

  const subject = nonEmptyOrNull(ad.subject);
  const body = nonEmptyOrNull(ad.body);
  const descricaoPartes = [subject, body].filter(
    (parte): parte is string => parte !== null,
  );

  return {
    codigoExterno: String(ad.listId),
    precoVenda: isAluguel ? null : priceCents,
    precoAluguel: isAluguel ? priceCents : null,
    condominio: moneyOrNull(
      findPriceInfoValue(ad.realEstatePriceInfo, 'condominio'),
    ),
    iptu: moneyOrNull(findPriceInfoValue(ad.realEstatePriceInfo, 'iptu')),
    area: parseFirstDecimal(findPropertyValue(ad.properties, 'size')),
    quartos: parseFirstInteger(findPropertyValue(ad.properties, 'rooms')),
    suites: parseFirstInteger(findPropertyValue(ad.properties, 'suites')),
    banheiros: parseFirstInteger(findPropertyValue(ad.properties, 'bathrooms')),
    vagas: parseFirstInteger(findPropertyValue(ad.properties, 'garage_spaces')),
    tipoImovelBruto:
      findPropertyValue(ad.properties, 'real_estate_type') ??
      findPropertyValue(ad.properties, 'category'),
    bairro: nonEmptyOrNull(ad.location.neighbourhood),
    cidade: nonEmptyOrNull(ad.location.municipality),
    estado: nonEmptyOrNull(ad.location.uf),
    cep: nonEmptyOrNull(ad.location.zipcode),
    endereco: nonEmptyOrNull(ad.location.address),
    numero: null,
    latitude: ad.location.mapLati,
    longitude: ad.location.mapLong,
    descricao: descricaoPartes.length > 0 ? descricaoPartes.join('\n\n') : null,
    anuncianteNome: nonEmptyOrNull(ad.user?.name),
    codigoCreci: null,
    publicadoEm: parseDate(ad.listTime),
    atualizadoEm: null,
  };
};
