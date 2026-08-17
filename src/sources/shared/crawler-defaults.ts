/**
 * Pausa mínima entre requests pro mesmo domínio (paginação inclusa). Sem isso
 * (default do Crawlee é 0s), as páginas de uma busca disparam uma atrás da
 * outra sem intervalo — um padrão fácil de reconhecer como automatizado.
 * Relevante para rodar o crawler diariamente sem levar bloqueio de IP.
 */
export const SAME_DOMAIN_DELAY_SECS = 3;
