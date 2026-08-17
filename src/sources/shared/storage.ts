import { Dataset, RequestQueue } from 'crawlee';

import type { RawListingItem } from '../../persistence/raw-listing-item.js';

/**
 * Datasets e RequestQueues nomeados não são apagados pelo `purgeOnStart` do Crawlee
 * (que só cobre as storages "default") — como o orquestrador roda as 4 fontes em
 * sequência no mesmo processo, cada fonte precisa começar do zero explicitamente,
 * senão itens/URLs de uma execução anterior vazam para a próxima.
 */
export async function openFreshDataset(
  name: string,
): Promise<Dataset<RawListingItem>> {
  const existing = await Dataset.open<RawListingItem>(name);
  await existing.drop();
  return Dataset.open<RawListingItem>(name);
}

export async function openFreshRequestQueue(
  name: string,
): Promise<RequestQueue> {
  const existing = await RequestQueue.open(name);
  await existing.drop();
  return RequestQueue.open(name);
}
