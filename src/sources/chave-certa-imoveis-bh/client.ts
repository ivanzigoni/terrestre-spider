import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import type { LinkAnuncio } from '../../persistence/link-anuncio.js';

/**
 * Chave Certa Imóveis BH (`discovery/independentes-diagnostico.md`, lote 5 de
 * `.claude/__workdir/integracao-lote/lotes.md`) roda sobre a plataforma SaaS
 * **Tecimob** (`api-sites.tecimob.com.br`, confirmado pelo rodapé "Site para
 * Imobiliarias" → tecimob.com.br) — multi-tenant, identificado por um UUID de
 * propriedade no path e um header `x-domain` com o domínio do site (sem o header, a API
 * responde "Não autorizado!" mesmo com o UUID certo — descoberto inspecionando os
 * headers reais enviados pelo navegador via Playwright MCP, não documentado em lugar
 * nenhum publicamente). Só uma fonte confirmada neste cluster até agora — diferente do
 * Kenlo/Imoview, não virou um cliente "compartilhado" ainda (sem 2º tenant pra validar
 * que o contrato realmente se repete).
 */

const TENANT_ID = '74631bfc-7b11-4964-8e17-2e5d97ba8275';
const DOMAIN = 'chavecertaimoveisbh.com.br';

export function buildSearchUrl(pagina: number): string {
  return `https://api-sites.tecimob.com.br/api/properties/featured-list/${TENANT_ID}?page=${String(pagina)}`;
}

export function buildRequestHeaders(): Record<string, string> {
  return { 'x-domain': DOMAIN, Accept: 'application/json' };
}

function parseTransaction(value: unknown): TipoTransacao | null {
  if (value === 'VENDA') {
    return TipoTransacao.VENDA;
  }
  if (value === 'ALUGUEL') {
    return TipoTransacao.ALUGUEL;
  }
  return null;
}

// Só os dois campos usados pra montar o link e decidir tipoTransacao — o resto do
// contrato rico (preço, quartos, imagens etc.) fica só na captura bruta, mesma
// disciplina do Kenlo/Imoview.
interface RawTecimobItem {
  url: string;
  transaction: unknown;
}

function isRawTecimobItem(value: unknown): value is RawTecimobItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return typeof item.url === 'string';
}

interface RawTecimobResponse {
  data: unknown[];
  meta: { pagination: { total_pages: number } };
}

function isRawTecimobResponse(value: unknown): value is RawTecimobResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const response = value as Record<string, unknown>;
  if (
    !Array.isArray(response.data) ||
    typeof response.meta !== 'object' ||
    response.meta === null
  ) {
    return false;
  }
  const pagination = (response.meta as Record<string, unknown>).pagination;
  return (
    typeof pagination === 'object' &&
    pagination !== null &&
    typeof (pagination as Record<string, unknown>).total_pages === 'number'
  );
}

export interface ParsedTecimobPage {
  items: LinkAnuncio[];
  totalPages: number;
}

export function parseSearchResponse(
  json: unknown,
  baseUrl: string,
): ParsedTecimobPage {
  if (!isRawTecimobResponse(json)) {
    throw new Error(
      `Chave Certa (Tecimob): resposta de /api/properties/featured-list em formato inesperado`,
    );
  }

  const items: LinkAnuncio[] = [];
  for (const raw of json.data) {
    if (!isRawTecimobItem(raw)) {
      continue;
    }
    const tipoTransacao = parseTransaction(raw.transaction);
    if (tipoTransacao === null) {
      continue;
    }
    items.push({ link: `${baseUrl}/imovel/${raw.url}`, tipoTransacao });
  }

  return { items, totalPages: json.meta.pagination.total_pages };
}
