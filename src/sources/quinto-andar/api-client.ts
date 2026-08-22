import { randomUUID } from 'node:crypto';

import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import type { RawListingItem } from '../../persistence/raw-listing-item.js';

export const QUINTO_ANDAR_API_URL =
  'https://apigw.prod.quintoandar.com.br/house-listing-search/v3/search/list';

// Tamanho de página observado no próprio site ao clicar em "Ver mais" — mantido igual
// para não destoar do tráfego real que a API já recebe.
export const PAGE_SIZE = 24;

type BusinessContext = 'RENT' | 'SALE';

// Campos pedidos explicitamente ao POST — a API ignora silenciosamente nomes que não
// reconhece, então cada um aqui foi confirmado manualmente contra uma resposta real
// antes de entrar nesta lista (ver discovery/quintoandar-diagnostico.md).
const REQUESTED_FIELDS = [
  'id',
  'address',
  'area',
  'bedrooms',
  'bathrooms',
  'parkingSpaces',
  'rent',
  'salePrice',
  'condominium',
  'iptu',
  'type',
  'forRent',
  'forSale',
  'neighbourhood',
  'city',
] as const;

export function businessContextFor(
  tipoTransacao: TipoTransacao,
): BusinessContext {
  return tipoTransacao === TipoTransacao.ALUGUEL ? 'RENT' : 'SALE';
}

/**
 * O slug de localidade (ex.: "belo-horizonte-mg-brasil") é o último segmento de path
 * da URL de busca já cadastrada em search-urls.json — evita duplicar a cidade como
 * constante separada no código da fonte.
 */
export function extractLocationSlug(searchUrl: string): string {
  const { pathname } = new URL(searchUrl);
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  const slug = segments[segments.length - 1];
  if (slug === undefined || slug === '') {
    throw new Error(
      `Não foi possível extrair o slug de localidade da URL "${searchUrl}"`,
    );
  }
  return slug;
}

export interface QuintoAndarSearchRequest {
  slug: string;
  businessContext: BusinessContext;
  offset: number;
}

/**
 * Corpo do POST, replicado a partir do que o próprio site envia. `location.coordinate`
 * e `viewport` funcionam vazios (`{}`) — testado ao vivo: o resultado é dirigido só por
 * `slug`/`locationDescriptions`, sem precisar de coordenadas hardcoded por cidade.
 */
export function buildSearchRequestPayload(
  params: QuintoAndarSearchRequest,
): string {
  return JSON.stringify({
    slug: params.slug,
    topics: [],
    fields: REQUESTED_FIELDS,
    pagination: { offset: params.offset, pageSize: PAGE_SIZE },
    context: {
      deviceId: randomUUID(),
      listShowing: true,
      mapShowing: true,
      numPhotos: 12,
      isSSR: false,
    },
    filters: {
      unknownSlugs: [],
      enableFlexibleSearch: true,
      businessContext: params.businessContext,
      location: {
        coordinate: {},
        viewport: {},
        neighborhoods: [],
        countryCode: 'BR',
      },
      priceRange: [],
      availability: 'ANY',
      occupancy: 'ANY',
      partnerIds: [],
      specialConditions: [],
      excludedSpecialConditions: [],
      blocklist: [],
      selectedHouses: [],
      categories: [],
      houseSpecs: {
        area: { range: {} },
        houseTypes: [],
        amenities: [],
        installations: [],
        bathrooms: { range: {} },
        bedrooms: { range: {} },
        parkingSpace: { range: {} },
        suites: { range: {} },
      },
      origin: 'HYBRID',
    },
    locationDescriptions: [{ description: params.slug }],
  });
}

interface QuintoAndarListingSource {
  id: number;
  address: string;
  area: number;
  bedrooms: number;
  bathrooms: number;
  parkingSpaces: number;
  rent: number;
  salePrice: number;
  condominium: number;
  iptu: number;
  type: string;
  forRent: boolean;
  forSale: boolean;
  neighbourhood: string;
  city: string;
}

// Guard manual em vez de `as`: o payload vem de uma API de terceiro não documentada,
// sem contrato formal — mesma disciplina de src/sources/shared/request-user-data.ts.
function isQuintoAndarListingSource(
  value: unknown,
): value is QuintoAndarListingSource {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const source = value as Record<string, unknown>;
  return (
    typeof source.id === 'number' &&
    typeof source.address === 'string' &&
    typeof source.area === 'number' &&
    typeof source.bedrooms === 'number' &&
    typeof source.bathrooms === 'number' &&
    typeof source.parkingSpaces === 'number' &&
    typeof source.rent === 'number' &&
    typeof source.salePrice === 'number' &&
    typeof source.condominium === 'number' &&
    typeof source.iptu === 'number' &&
    typeof source.type === 'string' &&
    typeof source.forRent === 'boolean' &&
    typeof source.forSale === 'boolean' &&
    typeof source.neighbourhood === 'string' &&
    typeof source.city === 'string'
  );
}

interface QuintoAndarSearchListResponse {
  hits: {
    hits: { _source: unknown }[];
    total: { value: number };
  };
}

function isSearchListResponse(
  value: unknown,
): value is QuintoAndarSearchListResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const root = value as Record<string, unknown>;
  if (typeof root.hits !== 'object' || root.hits === null) {
    return false;
  }
  const hits = root.hits as Record<string, unknown>;
  if (!Array.isArray(hits.hits)) {
    return false;
  }
  if (typeof hits.total !== 'object' || hits.total === null) {
    return false;
  }
  const total = hits.total as Record<string, unknown>;
  return typeof total.value === 'number';
}

/**
 * `businessContext: RENT`/`SALE` na requisição controla o ranking de busca, não é um
 * filtro estrito — `enableFlexibleSearch` (necessário para a busca funcionar como no
 * site) pode trazer algum imóvel cruzado (ex.: só-venda numa busca de aluguel).
 * Filtra pelos flags reais do item em vez de confiar cegamente no que foi pedido.
 */
function matchesBusinessContext(
  source: QuintoAndarListingSource,
  tipoTransacao: TipoTransacao,
): boolean {
  return tipoTransacao === TipoTransacao.ALUGUEL
    ? source.forRent
    : source.forSale;
}

// -1 é o sentinela da API para "não se aplica a este imóvel" (ex.: casa sem condomínio).
function normalizeMonetaryField(value: number): number {
  return value > 0 ? value : 0;
}

function mapToRawListingItem(
  source: QuintoAndarListingSource,
  tipoTransacao: TipoTransacao,
): RawListingItem {
  const localizacao = `${source.neighbourhood.trim()}, ${source.city.trim()}`;
  const acaoLabel =
    tipoTransacao === TipoTransacao.ALUGUEL ? 'alugar' : 'comprar';
  const bedroomsLabel = source.bedrooms === 1 ? 'quarto' : 'quartos';
  const titulo = `${source.type} com ${String(source.bedrooms)} ${bedroomsLabel} para ${acaoLabel} em ${localizacao}`;

  return {
    origem: OrigemAnuncio.QUINTO_ANDAR,
    tipoTransacao,
    tipoImovel: source.type,
    // Sem slug: a URL redireciona pro anúncio completo mesmo assim (confirmado ao
    // vivo) — mais simples e estável que reconstruir o slug de SEO.
    link: `https://www.quintoandar.com.br/imovel/${String(source.id)}`,
    titulo,
    quartos: source.bedrooms,
    banheiros: source.bathrooms,
    vagas: source.parkingSpaces,
    area: source.area,
    localizacao,
    // Sem campo equivalente identificado na API (ver discovery/quintoandar-diagnostico.md).
    dataDePublicacaoText: null,
    preco:
      tipoTransacao === TipoTransacao.ALUGUEL ? source.rent : source.salePrice,
    iptu: normalizeMonetaryField(source.iptu),
    condominio: normalizeMonetaryField(source.condominium),
    // Sem campo equivalente identificado na API.
    precoAntigo: null,
  };
}

export interface ParsedSearchPage {
  items: RawListingItem[];
  total: number;
}

export function parseSearchListResponse(
  json: unknown,
  tipoTransacao: TipoTransacao,
): ParsedSearchPage {
  if (!isSearchListResponse(json)) {
    throw new Error(
      'Resposta da API de busca do Quinto Andar em formato inesperado',
    );
  }

  const items: RawListingItem[] = [];
  for (const hit of json.hits.hits) {
    if (!isQuintoAndarListingSource(hit._source)) {
      continue;
    }
    if (!matchesBusinessContext(hit._source, tipoTransacao)) {
      continue;
    }
    items.push(mapToRawListingItem(hit._source, tipoTransacao));
  }

  return { items, total: json.hits.total.value };
}
