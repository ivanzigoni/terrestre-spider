import { log } from 'crawlee';

import { AppDataSource } from './persistence/data-source.js';
import { runNetimoveis } from './sources/netimoveis/main.js';
import { runOlx } from './sources/olx/main.js';
import { runVivaReal } from './sources/viva-real/main.js';
import { runZapImoveis } from './sources/zap-imoveis/main.js';

interface Fonte {
  nome: string;
  run: () => Promise<void>;
}

const FONTES: Fonte[] = [
  { nome: 'OLX', run: runOlx },
  { nome: 'Viva Real', run: runVivaReal },
  { nome: 'ZAP Imóveis', run: runZapImoveis },
  { nome: 'Netimóveis', run: runNetimoveis },
];

async function main(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  // Execução sequencial (não em paralelo): decisão deliberada pensando na instância
  // EC2 de produção, que roda Postgres + API + crawler juntos com pouca RAM sobrando
  // para vários browsers Chromium headless abertos ao mesmo tempo.
  for (const fonte of FONTES) {
    log.info(`=== iniciando ${fonte.nome} ===`);
    try {
      await fonte.run();
      log.info(`=== ${fonte.nome} concluído ===`);
    } catch (error) {
      log.error(`=== ${fonte.nome} falhou ===`, { error });
    }
  }

  await AppDataSource.destroy();
}

await main();
