import * as Sentry from '@sentry/node';
import { log } from 'crawlee';

import { AppDataSource } from './persistence/data-source.js';
import { Execucao } from './persistence/entities/execucao.entity.js';
import { OrigemAnuncio } from './persistence/enums/origem-anuncio.enum.js';
import { StatusExecucao } from './persistence/enums/status-execucao.enum.js';
import { runNetimoveis } from './sources/netimoveis/main.js';
import { runOlx } from './sources/olx/main.js';
import { runQuintoAndar } from './sources/quinto-andar/main.js';
import { runVivaReal } from './sources/viva-real/main.js';
import { runZapImoveis } from './sources/zap-imoveis/main.js';
import type { CrawlStats } from './sources/shared/crawl-stats.js';

// Sem captura de performance/tracing — este init é só para captura de erro. Sem
// SENTRY_DSN configurado, o SDK vira no-op automaticamente (comportamento documentado
// do @sentry/node), então as chamadas de captureException abaixo são seguras mesmo em
// dev local, sem precisar de guarda condicional em cada uma.
Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });

interface Fonte {
  nome: string;
  origem: OrigemAnuncio;
  run: () => Promise<CrawlStats>;
}

const FONTES: Fonte[] = [
  { nome: 'OLX', origem: OrigemAnuncio.OLX, run: runOlx },
  { nome: 'Viva Real', origem: OrigemAnuncio.VIVA_REAL, run: runVivaReal },
  {
    nome: 'ZAP Imóveis',
    origem: OrigemAnuncio.ZAP_IMOVEIS,
    run: runZapImoveis,
  },
  { nome: 'Netimóveis', origem: OrigemAnuncio.NETIMOVEIS, run: runNetimoveis },
  {
    nome: 'Quinto Andar',
    origem: OrigemAnuncio.QUINTO_ANDAR,
    run: runQuintoAndar,
  },
];

async function main(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  const execucaoRepo = AppDataSource.getRepository(Execucao);

  // Execução sequencial (não em paralelo): decisão deliberada pensando na instância
  // EC2 de produção, que roda Postgres + API + crawler juntos com pouca RAM sobrando
  // para vários browsers Chromium headless abertos ao mesmo tempo.
  for (const fonte of FONTES) {
    log.info(`=== iniciando ${fonte.nome} ===`);
    // Registrado como EM_ANDAMENTO antes de rodar, não só ao final: se o processo
    // travar ou for morto (OOM) no meio da fonte, a linha presa em EM_ANDAMENTO já é o
    // sinal de diagnóstico de que a última rodada não terminou.
    const execucao = await execucaoRepo.save(
      execucaoRepo.create({ origem: fonte.origem, iniciadaEm: new Date() }),
    );
    try {
      const stats = await fonte.run();
      await execucaoRepo.update(execucao.id, {
        status: StatusExecucao.SUCESSO,
        finalizadaEm: new Date(),
        requestsFinalizados: stats.requestsFinished,
        requestsFalhos: stats.requestsFailed,
      });
      log.info(`=== ${fonte.nome} concluído ===`);
    } catch (error) {
      await execucaoRepo.update(execucao.id, {
        status: StatusExecucao.FALHA,
        finalizadaEm: new Date(),
        mensagemErro: error instanceof Error ? error.message : String(error),
      });
      Sentry.captureException(error, { tags: { fonte: fonte.origem } });
      log.error(`=== ${fonte.nome} falhou ===`, { error });
    }
  }

  await AppDataSource.destroy();
  await Sentry.close(2000);
}

await main();
