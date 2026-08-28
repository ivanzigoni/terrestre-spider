import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';

/**
 * My Broker Belo Horizonte (`.claude/__workdir/integracao-lote/lotes.md`, lote 6,
 * investigação de 28-08-2026) — unidade BH da rede nacional **My Broker**
 * (`mybroker.com.br`, Next.js). O nome original do lote ("My Broker Diamond") não
 * corresponde a nenhuma empresa real encontrada — a pesquisa original nunca tinha URL
 * confirmada pra esse nome; usuário decidiu investigar a rede My Broker em si, que É uma
 * fonte real e viável.
 *
 * A página da agência (`/agencia/belo-horizonte`) só renderiza no servidor um carrossel
 * de ~20 imóveis; a listagem completa/paginada é client-side, chamando
 * `GET /api/properties?...&company_id=<uuid>&page=N` (JSON, sem anti-bot — confirmado ao
 * vivo via Playwright MCP, inspecionando o tráfego de rede da página real). Esse path
 * está sob `Disallow: /api/` do `robots.txt` — achado levado ao usuário antes de
 * implementar, que decidiu integrar mesmo assim. Cada item devolve um `code` numérico
 * que monta a URL de detalhe real: `/agencia/belo-horizonte/imoveis/{code}` (100%
 * server-renderizado — confirmado, não `/agencia/my-broker-belo-horizonte/...`, que é um
 * link quebrado presente no carrossel da própria home).
 */

const BASE_URL = 'https://www.mybroker.com.br';
const COMPANY_ID = '413b4bd7-96e9-4f49-859d-7fbc5c9a7c2d';
const COMPANY_NAME = 'Belo Horizonte';
const CITY_SLUG = 'belo-horizonte';
const PAGE_SIZE = 20;

export type MyBrokerUserIntent = 'comprar' | 'alugar';

export function tipoTransacaoParaUserIntent(
  tipoTransacao: TipoTransacao,
): MyBrokerUserIntent {
  return tipoTransacao === TipoTransacao.VENDA ? 'comprar' : 'alugar';
}

export function buildSearchUrl(
  userIntent: MyBrokerUserIntent,
  pagina: number,
): string {
  const url = new URL(`${BASE_URL}/api/properties`);
  url.searchParams.set('page_size', String(PAGE_SIZE));
  url.searchParams.set('lang', 'pt');
  url.searchParams.set('user_intent', userIntent);
  url.searchParams.set('company_id', COMPANY_ID);
  url.searchParams.set('company_name', COMPANY_NAME);
  url.searchParams.set('page', String(pagina));
  return url.toString();
}

export function buildDetailUrl(code: number): string {
  return `${BASE_URL}/agencia/${CITY_SLUG}/imoveis/${String(code)}`;
}

interface RawMyBrokerItem {
  code: number;
}

function isRawMyBrokerItem(value: unknown): value is RawMyBrokerItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return typeof (value as Record<string, unknown>).code === 'number';
}

interface RawMyBrokerResponse {
  properties: unknown[];
}

function isRawMyBrokerResponse(value: unknown): value is RawMyBrokerResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return Array.isArray((value as Record<string, unknown>).properties);
}

export function parseSearchResponse(json: unknown): string[] {
  if (!isRawMyBrokerResponse(json)) {
    throw new Error(
      'My Broker Belo Horizonte: resposta de /api/properties em formato inesperado',
    );
  }

  const links: string[] = [];
  for (const raw of json.properties) {
    if (!isRawMyBrokerItem(raw)) {
      continue;
    }
    links.push(buildDetailUrl(raw.code));
  }
  return links;
}
