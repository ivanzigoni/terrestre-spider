import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';

/**
 * Stilo Netimóveis (`.claude/__workdir/integracao-lote/lotes.md`, lote 5, investigação de
 * 28-08-2026) — WordPress com tema "netimoveis" (rede/CRM próprio **SAN**), sem
 * sitemap de imóveis e sem paginação real na vitrine da home (achado anterior, ainda
 * válido). O mecanismo de descoberta de verdade é o endpoint que o próprio botão
 * "Buscar" do site chama: `wp-admin/admin-ajax.php?action=pesquisar_imoveis`, que
 * devolve JSON paginado (confirmado ao vivo via Playwright MCP, interceptando a
 * requisição real da busca por bairro) — PHP local repassa pra uma API da rede SAN
 * (`wcfmastersite.netimoveis.com`), mas o parâmetro `localizacao` aceita cidade sem
 * bairro/região (`urlBairro`/`urlRegiao` vazios), trazendo o catálogo citywide inteiro
 * de uma vez (38.309 à venda / 5.690 aluguel no teste), sem precisar enumerar bairro por
 * bairro. Cada item já vem com `urlDetalheImovel` (path relativo da página de detalhe,
 * 100% servidor-renderizada) — sem precisar parsear transação por item, já que a busca é
 * separada por `transacao=venda`/`transacao=locacao` (mesmo padrão do OLX/Casa Mineira:
 * uma URL de busca por tipoTransacao).
 *
 * **Achado relevante para a decisão de integrar**: o `robots.txt` do site desautoriza
 * `/wp-admin/` (onde vive esse endpoint) e tem uma seção nomeando bots de IA
 * explicitamente, incluindo `ClaudeBot`, bloqueado para o site inteiro. Decisão
 * registrada em `lotes.md`: integrar mesmo assim.
 */

const BASE_URL = 'https://www.stilonetimoveis.com.br';
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;

// Sem bairro/região: cidade inteira de uma vez, mesmo raciocínio do Casa Mineira.
const LOCALIZACAO_CITYWIDE = JSON.stringify([
  {
    urlPais: 'BR',
    urlEstado: 'minas-gerais',
    urlCidade: 'belo-horizonte',
    urlRegiao: '',
    urlBairro: '',
    urlLogradouro: '',
    idAgrupamento: '',
    idLocalizacao: '',
  },
]);

export type StiloTransacaoParam = 'venda' | 'locacao';

export function tipoTransacaoParaParam(
  tipoTransacao: TipoTransacao,
): StiloTransacaoParam {
  return tipoTransacao === TipoTransacao.VENDA ? 'venda' : 'locacao';
}

export function buildSearchUrl(
  transacao: StiloTransacaoParam,
  pagina: number,
): string {
  const url = new URL(AJAX_URL);
  url.searchParams.set('action', 'pesquisar_imoveis');
  url.searchParams.set('transacao', transacao);
  url.searchParams.set('localizacao', LOCALIZACAO_CITYWIDE);
  url.searchParams.set('pagina', String(pagina));
  return url.toString();
}

export function buildDetailUrl(urlDetalheImovel: string): string {
  return new URL(urlDetalheImovel, `${BASE_URL}/`).toString();
}

interface RawStiloItem {
  urlDetalheImovel: string;
}

function isRawStiloItem(value: unknown): value is RawStiloItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return (
    typeof (value as Record<string, unknown>).urlDetalheImovel === 'string'
  );
}

interface RawStiloResponse {
  lista: unknown[];
}

function isRawStiloResponse(value: unknown): value is RawStiloResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return Array.isArray((value as Record<string, unknown>).lista);
}

export function parseSearchResponse(json: unknown): string[] {
  if (!isRawStiloResponse(json)) {
    throw new Error(
      'Stilo Netimóveis: resposta de admin-ajax.php (pesquisar_imoveis) em formato inesperado',
    );
  }

  const links: string[] = [];
  for (const raw of json.lista) {
    if (!isRawStiloItem(raw)) {
      continue;
    }
    links.push(buildDetailUrl(raw.urlDetalheImovel));
  }
  return links;
}
