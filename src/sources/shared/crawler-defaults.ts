/**
 * Pausa mínima entre requests pro mesmo domínio (paginação inclusa). Sem isso
 * (default do Crawlee é 0s), as páginas de uma busca disparam uma atrás da
 * outra sem intervalo — um padrão fácil de reconhecer como automatizado.
 * Relevante para rodar o crawler diariamente sem levar bloqueio de IP.
 */
export const SAME_DOMAIN_DELAY_SECS = 3;

const DEFAULT_MAX_REQUESTS_PER_CRAWL = 20;

function parseMaxRequestsPerCrawl(): number {
  const raw = process.env.SPIDER_MAX_REQUESTS_PER_CRAWL;
  if (raw === undefined || raw === '') {
    return DEFAULT_MAX_REQUESTS_PER_CRAWL;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `SPIDER_MAX_REQUESTS_PER_CRAWL inválido: "${raw}" (esperado inteiro positivo)`,
    );
  }
  return parsed;
}

/**
 * Teto de páginas por URL de busca (aluguel e venda contam separado). Sem isso,
 * uma busca citywide sem filtro de bairro pode ter 100+ páginas — os sites
 * ordenam por mais recente primeiro, então um teto ainda captura o que mudou
 * desde a última execução, só não alcança anúncios mais antigos.
 *
 * Ajustável via SPIDER_MAX_REQUESTS_PER_CRAWL, só para runs pontuais de seed
 * inicial (capturar o histórico completo de uma vez, antes de voltar para o
 * ritmo diário). Elevar isso é decisão deliberada por execução, feita passando
 * a env var na hora de rodar — o valor em código continua sendo o piso das
 * runs regulares, sem env var setada.
 */
export const MAX_REQUESTS_PER_CRAWL = parseMaxRequestsPerCrawl();
