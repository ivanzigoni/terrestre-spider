import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import type { RawListingItem } from '../../persistence/raw-listing-item.js';
import { temValorPlausivel } from './raw-listing-item-plausibilidade.js';

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

interface RawImoviewListingItem {
  codigo: number;
  titulo: string;
  tipo: string;
  bairro: string;
  cidade: string;
  numeroquartos: string;
  numerobanhos: string;
  numerovagas: string;
  areainterna: string;
  valor: string;
  // string nos sites originais (Buritis, Liderar); número no Casa Grande — 3º cliente
  // do cluster, mesmo campo, tipo diferente na resposta. Ver `parseValorAnterior`.
  valoranterior: string | number;
  valorcondominio: string | undefined;
  datahoracadastro: string;
  url_amigavel: string;
}

// Guard manual em vez de `as`: o payload vem de um endpoint interno não documentado,
// sem contrato formal — mesma disciplina do cliente do Quinto Andar
// (src/sources/quinto-andar/api-client.ts). `valorcondominio` é opcional (confirmado
// ausente em alguns imóveis de alguns sites do cluster). `valortratado` (inteiro pronto)
// não entra aqui de propósito: confirmado ausente em anúncios de aluguel do Liderar,
// mesmo com `valor` presente — por isso o preço é sempre derivado de `valor` (string),
// nunca de `valortratado`, ver `mapToRawListingItem`.
function isRawImoviewListingItem(
  value: unknown,
): value is RawImoviewListingItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.codigo === 'number' &&
    typeof item.titulo === 'string' &&
    typeof item.tipo === 'string' &&
    typeof item.bairro === 'string' &&
    typeof item.cidade === 'string' &&
    typeof item.numeroquartos === 'string' &&
    typeof item.numerobanhos === 'string' &&
    typeof item.numerovagas === 'string' &&
    typeof item.areainterna === 'string' &&
    typeof item.valor === 'string' &&
    (typeof item.valoranterior === 'string' ||
      typeof item.valoranterior === 'number') &&
    (item.valorcondominio === undefined ||
      typeof item.valorcondominio === 'string') &&
    typeof item.datahoracadastro === 'string' &&
    typeof item.url_amigavel === 'string'
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

// Converte string no formato "R$ 1.999.999,00" para inteiro em reais, sem centavos —
// confirmado por comparação item a item com o campo `valortratado` (quando presente)
// em discovery/imoview-diagnostico.md. `null` só para string vazia ou não numérica —
// interpretação de "zero" fica a cargo de quem chama (depende do campo: condomínio
// zero é dado real, valor anterior zero normalmente não é, ver `parseValorAnterior`).
function parseBrlToInteiro(valor: string): number | null {
  const trimmed = valor.trim();
  if (trimmed === '') {
    return null;
  }
  const semPrefixo = trimmed.replace(/^R\$\s*/, '').replace(/\./g, '');
  const parteInteira = semPrefixo.split(',')[0];
  const numero = parteInteira === undefined ? NaN : Number(parteInteira);
  return Number.isNaN(numero) ? null : numero;
}

// `precoAntigo` trata três sentinelas de "sem valor anterior" como equivalentes: string
// vazia (Buritis), "R$ 0,00" (Liderar) e o número `0` (Casa Grande — mesmo campo, mas a
// resposta já vem numérica em vez de string formatada). Tratar 0 como preço anterior
// real seria um dado falso — nenhum imóvel teve preço zero antes.
function parseValorAnterior(valor: string | number): number | null {
  const numero = typeof valor === 'number' ? valor : parseBrlToInteiro(valor);
  return numero === null || numero === 0 ? null : numero;
}

// `area` é `int` no schema (src/persistence/entities/imovel.entity.ts) — arredonda em
// vez de truncar, já que o valor de origem já vem com só 2 casas decimais (m²).
function parseAreaInterna(areainterna: string): number {
  const numero = Number(areainterna.replace(',', '.'));
  return Number.isNaN(numero) ? 0 : Math.round(numero);
}

function mapToRawListingItem(
  item: RawImoviewListingItem,
  baseUrl: string,
  origem: OrigemAnuncio,
  tipoTransacao: TipoTransacao,
): RawListingItem {
  return {
    origem,
    tipoTransacao,
    tipoImovel: item.tipo,
    link: `${baseUrl}/imovel/${item.url_amigavel}/${String(item.codigo)}`,
    titulo: item.titulo,
    quartos: Number(item.numeroquartos) || 0,
    banheiros: Number(item.numerobanhos) || 0,
    vagas: Number(item.numerovagas) || 0,
    area: parseAreaInterna(item.areainterna),
    localizacao: `${item.bairro}, ${item.cidade}`,
    dataDePublicacaoText: item.datahoracadastro,
    // Derivado de `valor` (string formatada), não de `valortratado`: confirmado ausente
    // em anúncios de aluguel do Liderar mesmo com `valor` presente. `current_price` é
    // `int` no schema (src/persistence/entities/anuncio.entity.ts) — `?? 0` é só rede de
    // segurança contra formato inesperado, nunca esperado de disparar na prática.
    preco: parseBrlToInteiro(item.valor) ?? 0,
    // Nome de campo para IPTU não confirmado neste cluster (ver
    // discovery/imoview-diagnostico.md) — 0 é o default do schema, não uma leitura real.
    iptu: 0,
    // Condomínio zero é dado real (ex.: casas), diferente de `precoAntigo` — por isso usa
    // o parser sem tratamento especial de zero.
    condominio:
      item.valorcondominio === undefined
        ? 0
        : (parseBrlToInteiro(item.valorcondominio) ?? 0),
    precoAntigo: parseValorAnterior(item.valoranterior),
  };
}

export interface ParsedImoviewPage {
  items: RawListingItem[];
  total: number;
}

export function parseSearchResponse(
  json: unknown,
  baseUrl: string,
  origem: OrigemAnuncio,
  tipoTransacao: TipoTransacao,
): ParsedImoviewPage {
  if (!isRawImoviewSearchResponse(json)) {
    throw new Error(
      `Imoview (${baseUrl}): resposta de /retornar-imoveis-disponiveis em formato inesperado`,
    );
  }

  const items: RawListingItem[] = [];
  for (const raw of json.lista) {
    if (!isRawImoviewListingItem(raw)) {
      continue;
    }
    const mapped = mapToRawListingItem(raw, baseUrl, origem, tipoTransacao);
    if (!temValorPlausivel(mapped)) {
      continue;
    }
    items.push(mapped);
  }

  return { items, total: json.quantidade };
}
