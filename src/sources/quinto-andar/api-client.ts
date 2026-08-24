import { randomUUID } from 'node:crypto';

import type { LinkAnuncio } from '../../persistence/link-anuncio.js';
import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';

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

// Só os campos usados para montar o link e filtrar por tipo de transação — o único
// dado extraído do payload nesta pipeline. Nenhum outro campo (endereço, área, quartos,
// preço etc.) é lido: a captura bruta da resposta inteira (ver `routes.ts`) já preserva
// tudo, sem perda.
interface QuintoAndarListingSource {
  id: number;
  forRent: boolean;
  forSale: boolean;
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
    typeof source.forRent === 'boolean' &&
    typeof source.forSale === 'boolean'
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

function mapToLinkAnuncio(
  source: QuintoAndarListingSource,
  tipoTransacao: TipoTransacao,
): LinkAnuncio {
  return {
    // Sem slug: a URL redireciona pro anúncio completo mesmo assim (confirmado ao
    // vivo) — mais simples e estável que reconstruir o slug de SEO.
    link: `https://www.quintoandar.com.br/imovel/${String(source.id)}`,
    tipoTransacao,
  };
}

export interface ParsedSearchPage {
  items: LinkAnuncio[];
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

  const items: LinkAnuncio[] = [];
  for (const hit of json.hits.hits) {
    if (!isQuintoAndarListingSource(hit._source)) {
      continue;
    }
    if (!matchesBusinessContext(hit._source, tipoTransacao)) {
      continue;
    }
    items.push(mapToLinkAnuncio(hit._source, tipoTransacao));
  }

  return { items, total: json.hits.total.value };
}
