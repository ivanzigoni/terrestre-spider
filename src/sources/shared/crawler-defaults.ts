import type { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';

/**
 * Pausa mínima entre requests pro mesmo domínio (paginação inclusa). Sem isso
 * (default do Crawlee é 0s), as páginas de uma busca disparam uma atrás da
 * outra sem intervalo — um padrão fácil de reconhecer como automatizado.
 * Relevante para rodar o crawler diariamente sem levar bloqueio de IP.
 */
export const SAME_DOMAIN_DELAY_SECS = 3;

const DEFAULT_MAX_LISTING_PAGES_PER_CRAWL = 20;

function parseMaxListingPagesPerCrawl(): number {
  const raw = process.env.SPIDER_MAX_LISTING_PAGES_PER_CRAWL;
  if (raw === undefined || raw === '') {
    return DEFAULT_MAX_LISTING_PAGES_PER_CRAWL;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `SPIDER_MAX_LISTING_PAGES_PER_CRAWL inválido: "${raw}" (esperado inteiro positivo)`,
    );
  }
  return parsed;
}

/**
 * Teto de páginas de LISTAGEM/BUSCA por URL de busca (aluguel e venda contam
 * separado) — não cobre a fase de detalhe (uma visita por anúncio único
 * descoberto na listagem, sem teto próprio, ver `*-main.ts` de cada fonte).
 * Renomeado de `MAX_REQUESTS_PER_CRAWL`: o nome antigo prometia "máximo de
 * requests" mas sempre controlou só profundidade de página de busca — uma
 * imprecisão inofensiva enquanto essa era a única dimensão de request, mas
 * enganosa agora que existe uma segunda fase (detalhe) que também gera
 * requests.
 *
 * Sem isso, uma busca citywide sem filtro de bairro pode ter 100+ páginas —
 * os sites ordenam por mais recente primeiro, então um teto ainda captura o
 * que mudou desde a última execução, só não alcança anúncios mais antigos.
 *
 * Ajustável via SPIDER_MAX_LISTING_PAGES_PER_CRAWL, só para runs pontuais de
 * seed inicial (capturar o histórico completo de uma vez, antes de voltar
 * para o ritmo diário). Elevar isso é decisão deliberada por execução, feita
 * passando a env var na hora de rodar — o valor em código continua sendo o
 * piso das runs regulares, sem env var setada.
 */
export const MAX_LISTING_PAGES_PER_CRAWL = parseMaxListingPagesPerCrawl();

/**
 * Override de profundidade de listagem por fonte (`SPIDER_MAX_LISTING_PAGES_PER_CRAWL_OLX`,
 * `_VIVA_REAL`, etc. — origem em maiúsculas, já vem com `_` nos nomes compostos). Mesma
 * disciplina de piso/override do valor global: sem a env var por fonte setada, cai no
 * valor global de sempre. Existe pra seeds calibrados onde cada fonte precisa de uma
 * profundidade diferente pra chegar num número-alvo de anúncios (cards por página varia
 * muito entre fontes) — sem isso, só dava pra aplicar o mesmo teto a todas de uma vez.
 */
export function getMaxListingPagesPerCrawl(origem: OrigemAnuncio): number {
  const perSourceKey = `SPIDER_MAX_LISTING_PAGES_PER_CRAWL_${origem.toUpperCase()}`;
  const raw = process.env[perSourceKey];
  if (raw === undefined || raw === '') {
    return MAX_LISTING_PAGES_PER_CRAWL;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `${perSourceKey} inválido: "${raw}" (esperado inteiro positivo)`,
    );
  }
  return parsed;
}

const DEFAULT_BATCH_SIZE = 1;

function parseBatchSize(): number {
  const raw = process.env.SPIDER_BATCH_SIZE;
  if (raw === undefined || raw === '') {
    return DEFAULT_BATCH_SIZE;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `SPIDER_BATCH_SIZE inválido: "${raw}" (esperado inteiro positivo)`,
    );
  }
  return parsed;
}

/**
 * Quantas fontes o orquestrador (src/main.ts) roda ao mesmo tempo. Piso 1
 * (sequencial, igual hoje) porque a instância de produção (EC2) roda
 * Postgres + API + crawler juntos, com RAM limitada pra vários browsers
 * headless simultâneos — subir isso é decisão deliberada por execução, via
 * env var, não um novo padrão silencioso. A ordem de `FONTES` em src/main.ts
 * já é pareada (1 fonte sem browser + 1 com Playwright por lote) para que
 * `SPIDER_BATCH_SIZE=2` nunca ligue 2 browsers ao mesmo tempo.
 */
export const BATCH_SIZE = parseBatchSize();

const DEFAULT_MAX_DETAIL_PAGES_PER_CRAWL = 200;

function parseMaxDetailPagesPerCrawl(): number {
  const raw = process.env.SPIDER_MAX_DETAIL_PAGES_PER_CRAWL;
  if (raw === undefined || raw === '') {
    return DEFAULT_MAX_DETAIL_PAGES_PER_CRAWL;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `SPIDER_MAX_DETAIL_PAGES_PER_CRAWL inválido: "${raw}" (esperado inteiro positivo)`,
    );
  }
  return parsed;
}

const MAX_DETAIL_PAGES_PER_CRAWL = parseMaxDetailPagesPerCrawl();

/**
 * Teto de páginas de DETALHE por fonte — mesmo raciocínio de
 * `MAX_LISTING_PAGES_PER_CRAWL`, mas para um perfil de volume diferente: cada fonte do
 * cluster Loft Sites descobre o catálogo inteiro via sitemap (sem paginação de busca,
 * ver `loft-sites-client.ts`) e visita uma página de detalhe por imóvel único — ~950
 * imóveis observados num único site do cluster durante o lote 3
 * (`.claude/__workdir/integracao-lote/lotes.md`). Sem teto, uma run completa das 8
 * fontes visitaria potencialmente milhares de páginas de detalhe por execução.
 *
 * Default (200) é uma escolha arbitrária deste lote, não validada com o time — ajustável
 * via `SPIDER_MAX_DETAIL_PAGES_PER_CRAWL` (global) ou
 * `SPIDER_MAX_DETAIL_PAGES_PER_CRAWL_<ORIGEM>` (por fonte, mesma disciplina de
 * `getMaxListingPagesPerCrawl`).
 */
export function getMaxDetailPagesPerCrawl(origem: OrigemAnuncio): number {
  const perSourceKey = `SPIDER_MAX_DETAIL_PAGES_PER_CRAWL_${origem.toUpperCase()}`;
  const raw = process.env[perSourceKey];
  if (raw === undefined || raw === '') {
    return MAX_DETAIL_PAGES_PER_CRAWL;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `${perSourceKey} inválido: "${raw}" (esperado inteiro positivo)`,
    );
  }
  return parsed;
}
