import { log } from 'crawlee';

import { createDataSource } from '../persistence/data-source.js';

/**
 * Esvazia `capturas_brutas` (não apaga a tabela) — uso pontual antes de um
 * reseed completo, pra não misturar linhas de execuções de teste com as do
 * seed histórico de verdade. `RESTART IDENTITY` também zera o contador de
 * `id`, então os ids do seed começam do 1.
 */
async function main(): Promise<void> {
  const dataSource = createDataSource();
  await dataSource.initialize();
  try {
    await dataSource.query('TRUNCATE TABLE "capturas_brutas" RESTART IDENTITY');
    log.info('reset-capturas-brutas: tabela esvaziada');
  } finally {
    await dataSource.destroy();
  }
}

await main();
