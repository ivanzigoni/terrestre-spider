import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import type { LinkAnuncio } from '../../persistence/link-anuncio.js';

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

// Só o campo usado para montar o link do anúncio — o único dado extraído da resposta
// nesta pipeline. Nenhum outro campo (preço, quartos, área etc.) é lido: a captura bruta
// da resposta inteira (ver `kenlo-router.ts`) já preserva tudo, sem perda — mesma
// disciplina adotada no cluster Imoview (`imoview-client.ts`).
interface RawKenloListingItem {
  url: string;
}

// Guard manual em vez de `as`: endpoint interno não documentado, sem contrato formal —
// mesma disciplina do cliente do Quinto Andar e do Imoview.
function isRawKenloListingItem(value: unknown): value is RawKenloListingItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return typeof item.url === 'string';
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

export interface ParsedKenloPage {
  items: LinkAnuncio[];
  total: number;
}

export function parseSearchResponse(
  json: unknown,
  baseUrl: string,
  tipoTransacao: TipoTransacao,
): ParsedKenloPage {
  if (!isRawKenloSearchResponse(json)) {
    throw new Error(
      `Kenlo (${baseUrl}): resposta de /api/listings em formato inesperado`,
    );
  }

  const items: LinkAnuncio[] = [];
  for (const raw of json.data) {
    if (!isRawKenloListingItem(raw)) {
      continue;
    }
    items.push({ link: `${baseUrl}${raw.url}`, tipoTransacao });
  }

  return { items, total: json.count };
}
