import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';

/**
 * Cluster ImobiBrasil (CDN `imobibrasil.app.br`, confirmado em
 * `discovery/independentes-diagnostico.md`, Achado 4, e no lote 4 de
 * `.claude/__workdir/integracao-lote/lotes.md`) — mesmo padrão de descoberta via sitemap
 * do Loft Sites (`sitemap-client.ts`), mas com uma vantagem: o slug da própria URL de
 * detalhe entrega o tipo de transação (`.../apartamento-venda-...` vs
 * `.../apartamento-locacao-...`), então não precisa do sentinela `null` usado lá.
 */

// O filtro genérico de `sitemap-client.ts` (prefixo `/imovel/`) é suficiente pro Loft
// Sites, mas o sitemap do ImobiBrasil também lista páginas de CATEGORIA sob o mesmo
// prefixo (`/imovel/venda/apartamento/belo-horizonte/`, e até a raiz `/imovel/`) —
// achado do smoke test ao vivo do lote 4, não previsto no diagnóstico original. Só
// página de imóvel individual tem um ID numérico logo após `/imovel/`
// (`/imovel/4291055/apartamento-venda-...`); página de categoria não.
const DETALHE_IMOVEL_PATH_REGEX = /^\/imovel\/\d+\//;

export function isDetalheImovelUrl(url: string): boolean {
  return DETALHE_IMOVEL_PATH_REGEX.test(new URL(url).pathname);
}

export function parseTipoTransacaoFromSlug(url: string): TipoTransacao | null {
  const path = new URL(url).pathname;
  if (path.includes('-locacao')) {
    return TipoTransacao.ALUGUEL;
  }
  if (path.includes('-venda')) {
    return TipoTransacao.VENDA;
  }
  return null;
}
