import type { LinkAnuncio } from '../../persistence/link-anuncio.js';
import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';

/**
 * Cliente compartilhado para o cluster de imobiliárias sobre a plataforma Universal
 * Software/Imoview — mesmo endpoint (`/retornar-imoveis-disponiveis`), mesmo contrato de
 * campos, confirmado contra três sites independentes (Buritis, Liderar, Administrar) em
 * `discovery/imoview-diagnostico.md`. Cada imobiliária só precisa de `baseUrl` + o valor
 * de `OrigemAnuncio` correspondente — não de um novo adaptador.
 */

// Tamanho de página observado nas requisições reais capturadas do próprio site (ver
// discovery/imoview-diagnostico.md).
export const IMOVIEW_PAGE_SIZE = 20;

const CODIGO_FINALIDADE: Record<TipoTransacao, 'aluguel' | 'venda'> = {
  [TipoTransacao.ALUGUEL]: 'aluguel',
  [TipoTransacao.VENDA]: 'venda',
};

// `codigocidade` é local a cada cliente Imoview, não uma tabela global compartilhada —
// confirmado ao testar um terceiro site do cluster (Administrar Imóveis), cujo
// `codigocidade=1` não corresponde a Belo Horizonte. Por isso não há constante de
// "código de Belo Horizonte": cada imobiliária precisa resolver o próprio código via
// `retornar-cidades-disponiveis` antes de buscar imóveis.
export interface ImoviewCidade {
  codigo: number;
  nome: string;
}

interface RawImoviewCidade {
  codigo: number;
  nome: string;
  urlAmigavel: string;
}

// Casa por `urlAmigavel`, não `nomeurlamigavel`: os dois nomes de campo coexistem em
// alguns clientes (Buritis) com o mesmo valor, mas o Liderar só expõe `urlAmigavel` —
// `nomeurlamigavel` está ausente na resposta dele. `urlAmigavel` é o único confirmado
// presente nos três sites testados (ver discovery/imoview-diagnostico.md).
function isRawImoviewCidade(value: unknown): value is RawImoviewCidade {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const cidade = value as Record<string, unknown>;
  return (
    typeof cidade.codigo === 'number' &&
    typeof cidade.nome === 'string' &&
    typeof cidade.urlAmigavel === 'string'
  );
}

interface RawImoviewCidadesResponse {
  lista: unknown[];
}

function isRawImoviewCidadesResponse(
  value: unknown,
): value is RawImoviewCidadesResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return Array.isArray((value as Record<string, unknown>).lista);
}

/**
 * Resolve o código interno de uma cidade para um cliente Imoview específico, casando
 * por `urlAmigavel` (ex.: `"belo-horizonte"`). Falha alto (não retorna `null`) se a
 * cidade não estiver no catálogo deste cliente — confirmado que isso acontece de verdade
 * (Administrar Imóveis não tem nenhuma cidade de BH cadastrada), então é um erro de
 * configuração real da fonte, não um caso a ignorar silenciosamente.
 */
export async function resolveCidadeCode(
  baseUrl: string,
  cidadeSlugAmigavel: string,
): Promise<ImoviewCidade> {
  const response = await fetch(`${baseUrl}/retornar-cidades-disponiveis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: 'finalidade=venda',
  });
  if (!response.ok) {
    throw new Error(
      `Imoview (${baseUrl}): /retornar-cidades-disponiveis respondeu status ${String(response.status)}`,
    );
  }

  const json: unknown = await response.json();
  if (!isRawImoviewCidadesResponse(json)) {
    throw new Error(
      `Imoview (${baseUrl}): resposta de /retornar-cidades-disponiveis em formato inesperado`,
    );
  }

  const cidade = json.lista.find(
    (item): item is RawImoviewCidade =>
      isRawImoviewCidade(item) && item.urlAmigavel === cidadeSlugAmigavel,
  );
  if (cidade === undefined) {
    throw new Error(
      `Imoview (${baseUrl}): cidade "${cidadeSlugAmigavel}" não está no catálogo deste ` +
        'cliente — codigocidade é local a cada imobiliária, não uma tabela global ' +
        '(ver discovery/imoview-diagnostico.md)',
    );
  }
  return { codigo: cidade.codigo, nome: cidade.nome };
}

export interface ImoviewSearchParams {
  cidade: ImoviewCidade;
  tipoTransacao: TipoTransacao;
  numeroPagina: number;
}

/**
 * Corpo do POST replicado a partir do que o próprio site envia — confirmado idêntico
 * (mesmos nomes de campo) em três sites independentes do cluster. Só os campos
 * efetivamente usados pelo servidor para filtrar/paginar são enviados; os demais campos
 * observados nas capturas reais têm valor-padrão no servidor (confirmado por teste
 * direto com payload reduzido, ver discovery/imoview-diagnostico.md).
 */
export function buildSearchPayload(params: ImoviewSearchParams): string {
  return new URLSearchParams({
    finalidade: CODIGO_FINALIDADE[params.tipoTransacao],
    codigocidade: String(params.cidade.codigo),
    numeropagina: String(params.numeroPagina),
    numeroregistros: String(IMOVIEW_PAGE_SIZE),
    ordenacao: 'dataatualizacaodesc',
    'cidades[codigo]': String(params.cidade.codigo),
    'cidades[nome]': params.cidade.nome,
  }).toString();
}

// Só os dois campos usados para montar o link do anúncio — o único dado extraído do
// payload nesta pipeline. Nenhum outro campo da resposta (preço, quartos, área etc.) é
// lido: a captura bruta da resposta inteira (ver `imoview-router.ts`) já preserva tudo,
// sem perda.
interface RawImoviewListingItem {
  codigo: number;
  url_amigavel: string;
}

// Guard manual em vez de `as`: o payload vem de um endpoint interno não documentado,
// sem contrato formal — mesma disciplina do cliente do Quinto Andar
// (src/sources/quinto-andar/api-client.ts).
function isRawImoviewListingItem(
  value: unknown,
): value is RawImoviewListingItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.codigo === 'number' && typeof item.url_amigavel === 'string'
  );
}

interface RawImoviewSearchResponse {
  lista: unknown[];
  quantidade: number;
}

function isRawImoviewSearchResponse(
  value: unknown,
): value is RawImoviewSearchResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const response = value as Record<string, unknown>;
  return (
    Array.isArray(response.lista) && typeof response.quantidade === 'number'
  );
}

function buildLink(item: RawImoviewListingItem, baseUrl: string): string {
  return `${baseUrl}/imovel/${item.url_amigavel}/${String(item.codigo)}`;
}

export interface ParsedImoviewPage {
  items: LinkAnuncio[];
  total: number;
}

export function parseSearchResponse(
  json: unknown,
  baseUrl: string,
  tipoTransacao: TipoTransacao,
): ParsedImoviewPage {
  if (!isRawImoviewSearchResponse(json)) {
    throw new Error(
      `Imoview (${baseUrl}): resposta de /retornar-imoveis-disponiveis em formato inesperado`,
    );
  }

  const items: LinkAnuncio[] = [];
  for (const raw of json.lista) {
    if (!isRawImoviewListingItem(raw)) {
      continue;
    }
    items.push({ link: buildLink(raw, baseUrl), tipoTransacao });
  }

  return { items, total: json.quantidade };
}
