import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import type { RawListingItem } from '../../persistence/raw-listing-item.js';
import { temValorPlausivel } from './raw-listing-item-plausibilidade.js';

/**
 * Cliente compartilhado para o cluster de imobiliárias sobre a plataforma Kenlo (SaaS de
 * site+CRM imobiliário, produto de terceiro análogo ao Universal Software/Imoview, mas
 * plataforma diferente) — mesmo endpoint (`/api/listings/<finalidade>/<cidade>`), mesmo
 * contrato de campos, confirmado contra dois sites independentes (JMC Imóveis, Luxus
 * Imóveis Premium) em `discovery/independentes-diagnostico.md` (Achado 2) e
 * `.claude/__workdir/integracao-lote/lotes.md` (lote 2). Cada imobiliária só precisa de
 * `baseUrl` + o valor de `OrigemAnuncio` correspondente.
 */

// Tamanho de página fixo do servidor (sem parâmetro de tamanho na URL) — confirmado
// idêntico (12 itens) em `a-venda`/`para-alugar`, JMC e Luxus, inclusive em páginas
// distantes (Luxus página 30 de 33), ver lote 2 em lotes.md.
export const KENLO_PAGE_SIZE = 12;

const SEGMENTO_FINALIDADE: Record<TipoTransacao, 'a-venda' | 'para-alugar'> = {
  [TipoTransacao.VENDA]: 'a-venda',
  [TipoTransacao.ALUGUEL]: 'para-alugar',
};

export interface KenloSearchParams {
  tipoTransacao: TipoTransacao;
  numeroPagina: number;
  // Slug de cidade no path da URL (ex.: "belo-horizonte") — diferente do Imoview, não
  // existe endpoint de resolução de código; o slug é aceito diretamente pelo servidor.
  // Filtra no próprio servidor (confirmado: sem o slug, a busca devolve toda a região de
  // atuação do tenant — ver "Achado sobre escopo de cidade" em lotes.md, lote 2 — Luxus
  // tinha só 398 de 939 imóveis à venda em Belo Horizonte, o resto majoritariamente em
  // Nova Lima).
  cidadeSlug: string;
}

/**
 * Monta a URL de busca (GET simples, sem corpo) — diferente do Imoview, que usa POST
 * com corpo `application/x-www-form-urlencoded`. Sem sessão/cookies, confirmado por
 * `curl` isolado nos dois sites do cluster (ver lote 2).
 */
export function buildSearchUrl(
  baseUrl: string,
  params: KenloSearchParams,
): string {
  const segmento = SEGMENTO_FINALIDADE[params.tipoTransacao];
  const query = new URLSearchParams({
    'com-fotos': 'true',
    expand: '1',
    pagina: String(params.numeroPagina),
  });
  return `${baseUrl}/api/listings/${segmento}/${params.cidadeSlug}?${query.toString()}`;
}

/**
 * `bedrooms`/`bathrooms`/`garages`/`area`/`sale_price`/`rent_price` vêm como array
 * `[min, max]` (provavelmente pensado para resultado de busca com faixa, mas para um
 * imóvel específico os dois valores são sempre idênticos nas amostras confirmadas) — só
 * o primeiro elemento é usado. `property_purposes` varia entre string única
 * ("FOR_SALE"/"FOR_RENT") e array (["FOR_SALE","FOR_RENT"]) para imóveis que aceitam
 * venda e aluguel ao mesmo tempo — não é usado para decidir `tipoTransacao` do item
 * (isso vem do próprio segmento de URL consultado, `a-venda` ou `para-alugar`, mesma
 * lógica do Imoview), só documentado aqui porque é a explicação do formato variável.
 */
interface RawKenloListingItem {
  url: string;
  heading1: string;
  neighborhood: string;
  city: string;
  bedrooms: number[];
  bathrooms: number[];
  garages: number[];
  area: number[];
  sale_price: number[];
  rent_price: number[];
  property_type: string;
  // `null` explícito ou chave inteiramente ausente do objeto (confirmado nos dois — ver
  // lote 2 de lotes.md: 8 de 12 itens da página 1 de venda da JMC não têm a chave
  // `property_tax` no JSON, não é `null`) — os dois casos significam "sem IPTU/condomínio
  // informado" e são tratados de forma idêntica em `mapToRawListingItem` (`?? 0`).
  property_tax?: number | null;
  condo_fees?: number | null;
  updated_at: string;
}

function isNumberArrayComElemento(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === 'number')
  );
}

// Guard manual em vez de `as`: endpoint interno não documentado, sem contrato formal —
// mesma disciplina do cliente do Quinto Andar e do Imoview.
function isRawKenloListingItem(value: unknown): value is RawKenloListingItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.url === 'string' &&
    typeof item.heading1 === 'string' &&
    typeof item.neighborhood === 'string' &&
    typeof item.city === 'string' &&
    isNumberArrayComElemento(item.bedrooms) &&
    isNumberArrayComElemento(item.bathrooms) &&
    isNumberArrayComElemento(item.garages) &&
    isNumberArrayComElemento(item.area) &&
    isNumberArrayComElemento(item.sale_price) &&
    isNumberArrayComElemento(item.rent_price) &&
    typeof item.property_type === 'string' &&
    (item.property_tax === undefined ||
      item.property_tax === null ||
      typeof item.property_tax === 'number') &&
    (item.condo_fees === undefined ||
      item.condo_fees === null ||
      typeof item.condo_fees === 'number') &&
    typeof item.updated_at === 'string'
  );
}

interface RawKenloSearchResponse {
  data: unknown[];
  count: number;
}

function isRawKenloSearchResponse(
  value: unknown,
): value is RawKenloSearchResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const response = value as Record<string, unknown>;
  return Array.isArray(response.data) && typeof response.count === 'number';
}

function mapToRawListingItem(
  item: RawKenloListingItem,
  baseUrl: string,
  origem: OrigemAnuncio,
  tipoTransacao: TipoTransacao,
): RawListingItem {
  const preco =
    tipoTransacao === TipoTransacao.VENDA
      ? (item.sale_price[0] ?? 0)
      : (item.rent_price[0] ?? 0);

  return {
    origem,
    tipoTransacao,
    // Vocabulário próprio da Kenlo (ex.: "PENTHOUSE_APARTMENT"), sem tradução — mesma
    // convenção do Quinto Andar (`tipoImovel: source.type`), campo espelha o contrato
    // de uma API de terceiro.
    tipoImovel: item.property_type,
    link: `${baseUrl}${item.url}`,
    titulo: item.heading1,
    quartos: item.bedrooms[0] ?? 0,
    banheiros: item.bathrooms[0] ?? 0,
    vagas: item.garages[0] ?? 0,
    area: Math.round(item.area[0] ?? 0),
    localizacao: `${item.neighborhood}, ${item.city}`,
    dataDePublicacaoText: item.updated_at,
    preco,
    // `property_tax` é o IPTU — quando o imóvel não tem valor informado, a chave vem
    // `null` ou inteiramente ausente do JSON (os dois casos tratados igual aqui),
    // diferente do cluster Imoview, onde o campo não foi localizado (`iptu: 0` fixo lá).
    iptu: item.property_tax ?? 0,
    condominio: item.condo_fees ?? 0,
    // Kenlo não expõe preço anterior/histórico em nenhum campo da amostra confirmada
    // (diferente de `valoranterior` no Imoview) — sempre `null` até achado em contrário.
    precoAntigo: null,
  };
}

export interface ParsedKenloPage {
  items: RawListingItem[];
  total: number;
}

export function parseSearchResponse(
  json: unknown,
  baseUrl: string,
  origem: OrigemAnuncio,
  tipoTransacao: TipoTransacao,
): ParsedKenloPage {
  if (!isRawKenloSearchResponse(json)) {
    throw new Error(
      `Kenlo (${baseUrl}): resposta de /api/listings em formato inesperado`,
    );
  }

  const items: RawListingItem[] = [];
  for (const raw of json.data) {
    if (!isRawKenloListingItem(raw)) {
      continue;
    }
    const mapped = mapToRawListingItem(raw, baseUrl, origem, tipoTransacao);
    if (!temValorPlausivel(mapped)) {
      continue;
    }
    items.push(mapped);
  }

  return { items, total: json.count };
}
