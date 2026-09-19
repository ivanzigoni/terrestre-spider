import { z } from 'zod';

import type { AnuncioNormalizado, Parser } from '../anuncio-normalizado.js';
import { parseMoneyToCents } from './shared/money.js';

const houseAddressSchema = z.object({
  street: z.string().nullable().optional(),
  neighborhood: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  zipCode: z.string().nullable().optional(),
  stateAcronym: z.string().nullable().optional(),
  lat: z.coerce.number().nullable().optional(),
  lng: z.coerce.number().nullable().optional(),
});

const generatedDescriptionSchema = z.object({
  longDescription: z.string().nullable().optional(),
});

const housePhotoSchema = z.object({
  url: z.string(),
  cover: z.boolean().nullable().optional(),
});

const houseInfoSchema = z.object({
  id: z.union([z.string(), z.number()]),
  bedrooms: z.coerce.number().nullable().optional(),
  bathrooms: z.coerce.number().nullable().optional(),
  iptu: z.coerce.number().nullable().optional(),
  area: z.coerce.number().nullable().optional(),
  parkingSpaces: z.coerce.number().nullable().optional(),
  suites: z.coerce.number().nullable().optional(),
  type: z.string().nullable().optional(),
  forRent: z.boolean().nullable(),
  forSale: z.boolean().nullable(),
  rentPrice: z.coerce.number().nullable().optional(),
  salePrice: z.coerce.number().nullable().optional(),
  condoPrice: z.coerce.number().nullable().optional(),
  lastPublishedDate: z.string().nullable().optional(),
  address: houseAddressSchema.nullable().optional(),
  generatedDescription: generatedDescriptionSchema.nullable().optional(),
  photos: z.array(housePhotoSchema).nullable().optional(),
});

const nextDataSchema = z.object({
  props: z.object({
    pageProps: z.object({
      initialState: z.object({
        house: z.object({
          houseInfo: houseInfoSchema,
        }),
      }),
    }),
  }),
});

function extractNextData(html: string): unknown {
  const match =
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(
      html,
    );
  if (match === null) {
    throw new Error('QuintoAndar: script#__NEXT_DATA__ não encontrado no HTML');
  }

  const raw = match[1];
  if (raw === undefined) {
    throw new Error(
      'QuintoAndar: script#__NEXT_DATA__ encontrado, mas sem conteúdo',
    );
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    throw new Error(
      `QuintoAndar: falha ao fazer parse do JSON em __NEXT_DATA__ (${motivo})`,
    );
  }
}

function nonEmptyOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().normalize('NFC');
  return trimmed === '' ? null : trimmed;
}

function parseDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractCoverPhotoUrl(
  photos: z.infer<typeof housePhotoSchema>[] | null | undefined,
): string | null {
  if (photos === null || photos === undefined || photos.length === 0) {
    return null;
  }
  const capa = photos.find((foto) => foto.cover === true) ?? photos[0];
  return capa === undefined
    ? null
    : `https://www.quintoandar.com.br/img/xlg/${capa.url}`;
}

export const parseQuintoAndar: Parser = (
  conteudo: string,
): AnuncioNormalizado => {
  const nextData = extractNextData(conteudo);
  const result = nextDataSchema.safeParse(nextData);
  if (!result.success) {
    throw new Error(
      `QuintoAndar: formato inesperado em props.pageProps.initialState.house.houseInfo (${result.error.message})`,
    );
  }

  const { houseInfo } = result.data.props.pageProps.initialState.house;
  const endereco = houseInfo.address ?? null;

  return {
    codigoExterno: String(houseInfo.id),
    precoVenda: houseInfo.forSale
      ? parseMoneyToCents(houseInfo.salePrice ?? null)
      : null,
    precoAluguel: houseInfo.forRent
      ? parseMoneyToCents(houseInfo.rentPrice ?? null)
      : null,
    disponivelAluguel: houseInfo.forRent,
    disponivelVenda: houseInfo.forSale,
    condominio: parseMoneyToCents(houseInfo.condoPrice ?? null),
    iptu: parseMoneyToCents(houseInfo.iptu ?? null),
    area: houseInfo.area ?? null,
    quartos: houseInfo.bedrooms ?? null,
    suites: houseInfo.suites ?? null,
    banheiros: houseInfo.bathrooms ?? null,
    vagas: houseInfo.parkingSpaces ?? null,
    tipoImovelBruto: nonEmptyOrNull(houseInfo.type),
    bairro: nonEmptyOrNull(endereco?.neighborhood),
    cidade: nonEmptyOrNull(endereco?.city),
    estado: nonEmptyOrNull(endereco?.stateAcronym),
    cep: nonEmptyOrNull(endereco?.zipCode),
    endereco: nonEmptyOrNull(endereco?.street),
    numero: null,
    latitude: endereco?.lat ?? null,
    longitude: endereco?.lng ?? null,
    descricao: nonEmptyOrNull(houseInfo.generatedDescription?.longDescription),
    imagemUrl: extractCoverPhotoUrl(houseInfo.photos),
    anuncianteNome: null,
    codigoCreci: null,
    publicadoEm: parseDate(houseInfo.lastPublishedDate),
    atualizadoEm: null,
  };
};
