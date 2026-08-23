import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { log } from 'crawlee';

import { createDataSource } from '../persistence/data-source.js';

/**
 * Backup pontual antes de descontinuar o pipeline estruturado (`anuncios`/
 * `observacoes_preco`) — script de uso único, não faz parte do pipeline
 * regular. Exporta as duas tabelas inteiras em JSON local via SQL cru (não
 * via repositório TypeORM — as entidades saíram do array `entities` da
 * fábrica em data-source.ts junto com a descontinuação, e SQL cru garante
 * fidelidade total das colunas mesmo que a entidade não mapeasse tudo).
 */
async function main(): Promise<void> {
  const dataSource = createDataSource();
  await dataSource.initialize();
  try {
    const anuncios = await dataSource.query<Record<string, unknown>[]>(
      'SELECT * FROM "anuncios"',
    );
    const observacoesPreco = await dataSource.query<Record<string, unknown>[]>(
      'SELECT * FROM "observacoes_preco"',
    );

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outDir = path.join(process.cwd(), 'backups');
    await mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, `anuncios-${timestamp}.json`);

    await writeFile(
      outPath,
      JSON.stringify({ anuncios, observacoesPreco }, null, 2),
      'utf-8',
    );

    log.info(
      `backup-anuncios: ${String(anuncios.length)} anúncio(s) e ${String(observacoesPreco.length)} observação(ões) de preço salvos em ${outPath}`,
    );
  } finally {
    await dataSource.destroy();
  }
}

await main();
