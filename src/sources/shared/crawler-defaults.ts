/**
 * Pausa mínima entre requests pro mesmo domínio (paginação inclusa). Sem isso
 * (default do Crawlee é 0s), as páginas de uma busca disparam uma atrás da
 * outra sem intervalo — um padrão fácil de reconhecer como automatizado.
 * Relevante para rodar o crawler diariamente sem levar bloqueio de IP.
 */
export const SAME_DOMAIN_DELAY_SECS = 3;

/**
 * Teto de páginas por URL de busca (aluguel e venda contam separado). Sem isso,
 * uma busca citywide sem filtro de bairro pode ter 100+ páginas — os sites
 * ordenam por mais recente primeiro, então um teto ainda captura o que mudou
 * desde a última execução, só não alcança anúncios mais antigos.
 */
export const MAX_REQUESTS_PER_CRAWL = 20;
