import type { Dictionary } from 'crawlee';
import { Dataset, RequestQueue } from 'crawlee';

import type { RawListingItem } from '../../persistence/raw-listing-item.js';

/**
 * Datasets e RequestQueues nomeados não são apagados pelo `purgeOnStart` do Crawlee
 * (que só cobre as storages "default") — como o orquestrador roda as 4 fontes em
 * sequência no mesmo processo, cada fonte precisa começar do zero explicitamente,
 * senão itens/URLs de uma execução anterior vazam para a próxima.
 *
 * Genérico com default `RawListingItem` — as chamadas existentes (sem argumento de
 * tipo explícito) continuam recebendo `Dataset<RawListingItem>` como sempre; só um
 * Dataset de outro formato (ex.: captura bruta) precisa passar o tipo explicitamente.
 */
export async function openFreshDataset<T extends Dictionary = RawListingItem>(
  name: string,
): Promise<Dataset<T>> {
  const existing = await Dataset.open<T>(name);
  await existing.drop();
  return Dataset.open<T>(name);
}

export async function openFreshRequestQueue(
  name: string,
): Promise<RequestQueue> {
  const existing = await RequestQueue.open(name);
  await existing.drop();
  return RequestQueue.open(name);
}
