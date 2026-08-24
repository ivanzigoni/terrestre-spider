import type { RawListingItem } from '../../persistence/raw-listing-item.js';

/**
 * `current_price`/`current_condominio`/`old_price` são `int` (int4) no schema — teto real
 * de ~2,147 bilhões. Confirmado em produção: um imóvel real do Liderar (170m², Lourdes)
 * tinha `valor` cadastrado como "R$ 3.650.000.000,00" (3,65 bilhões) em vez de
 * "R$ 3.650.000,00" — erro de digitação de quem cadastrou o anúncio no Imoview, não um
 * bug de parsing (o parser converteu exatamente o que a fonte informou). Sem este filtro,
 * um único anúncio com erro de digitação derruba o lote inteiro de upsert (500 itens).
 * Extraído de imoview-client.ts para reaproveito entre clusters — a checagem não é
 * específica de nenhuma fonte, é uma restrição do schema em si.
 */
export const POSTGRES_INT4_MAX = 2_147_483_647;

export function temValorPlausivel(item: RawListingItem): boolean {
  return (
    item.preco <= POSTGRES_INT4_MAX &&
    item.condominio <= POSTGRES_INT4_MAX &&
    (item.precoAntigo === null || item.precoAntigo <= POSTGRES_INT4_MAX)
  );
}
