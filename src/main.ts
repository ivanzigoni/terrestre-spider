import * as Sentry from '@sentry/node';
import { log } from 'crawlee';

import { createDataSource } from './persistence/data-source.js';
import { Execucao } from './persistence/entities/execucao.entity.js';
import { OrigemAnuncio } from './persistence/enums/origem-anuncio.enum.js';
import { StatusExecucao } from './persistence/enums/status-execucao.enum.js';
import { Mutex } from './persistence/upload-mutex.js';
import { runAdimoveisBh } from './sources/adimoveis-bh/main.js';
import { runCasaGrandeImoveis } from './sources/casa-grande-imoveis/main.js';
import { runDiegoGarciaImoveis } from './sources/diego-garcia-imoveis/main.js';
import { runImobiliariaBuritis } from './sources/imobiliaria-buritis/main.js';
import { runImovelweb } from './sources/imovelweb/main.js';
import { runIviInvistaImoveis } from './sources/ivi-invista-imoveis/main.js';
import { runJmcImoveis } from './sources/jmc-imoveis/main.js';
import { runLiderarImoveis } from './sources/liderar-imoveis/main.js';
import { runLuxusImoveisPremium } from './sources/luxus-imoveis-premium/main.js';
import { runNetimoveis } from './sources/netimoveis/main.js';
import { runOlx } from './sources/olx/main.js';
import { runQuintoAndar } from './sources/quinto-andar/main.js';
import { runRealImobiliaria } from './sources/real-imobiliaria/main.js';
import { BATCH_SIZE } from './sources/shared/crawler-defaults.js';
import { runValoreImoveis } from './sources/valore-imoveis/main.js';
import { runVivaReal } from './sources/viva-real/main.js';
import { runZapImoveis } from './sources/zap-imoveis/main.js';
import type { ExecucaoStats } from './sources/shared/crawl-stats.js';

// Sem captura de performance/tracing — este init é só para captura de erro. Sem
// SENTRY_DSN configurado, o SDK vira no-op automaticamente (comportamento documentado
// do @sentry/node), então as chamadas de captureException abaixo são seguras mesmo em
// dev local, sem precisar de guarda condicional em cada uma.
Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });

interface Fonte {
  nome: string;
  origem: OrigemAnuncio;
  run: (uploadMutex: Mutex) => Promise<ExecucaoStats>;
}

// Ordem pareada — uma fonte sem browser (CheerioCrawler/HttpCrawler) seguida
// de uma com PlaywrightCrawler — não alfabética nem por origem. Com
// BATCH_SIZE=2 (ver crawler-defaults.ts), cada lote de 2 processados juntos
// nunca sobe 2 browsers Chromium headless ao mesmo tempo: o par pesado fica
// isolado, o leve roda ao lado dele. Exceção documentada no final da lista:
// a expansão do cluster Imoview (lote 1 de
// `.claude/__workdir/integracao-lote/lotes.md`) trouxe 4 fontes que precisam
// da variante navegador (bloqueio confirmado contra cliente HTTP direto) e
// só 1 nova fonte HTTP (AdimóveisBH) para parear — sem fonte HTTP sobrando
// para a quarta, IVI Invista e Real Imobiliária ficam adjacentes como
// PlaywrightCrawler+PlaywrightCrawler. Sob BATCH_SIZE=2, esse par específico
// sobe 2 browsers ao mesmo tempo; SPIDER_BATCH_SIZE=1 (piso/default) não é
// afetado.
const FONTES: Fonte[] = [
  { nome: 'OLX', origem: OrigemAnuncio.OLX, run: runOlx },
  {
    nome: 'ZAP Imóveis',
    origem: OrigemAnuncio.ZAP_IMOVEIS,
    run: runZapImoveis,
  },
  { nome: 'Viva Real', origem: OrigemAnuncio.VIVA_REAL, run: runVivaReal },
  { nome: 'Netimóveis', origem: OrigemAnuncio.NETIMOVEIS, run: runNetimoveis },
  {
    nome: 'Quinto Andar',
    origem: OrigemAnuncio.QUINTO_ANDAR,
    run: runQuintoAndar,
  },
  { nome: 'Imovelweb', origem: OrigemAnuncio.IMOVELWEB, run: runImovelweb },
  {
    nome: 'Imobiliária Buritis',
    origem: OrigemAnuncio.IMOBILIARIA_BURITIS,
    run: runImobiliariaBuritis,
  },
  {
    nome: 'Liderar Imóveis',
    origem: OrigemAnuncio.LIDERAR_IMOVEIS,
    run: runLiderarImoveis,
  },
  {
    nome: 'Casa Grande Imóveis',
    origem: OrigemAnuncio.CASA_GRANDE_IMOVEIS,
    run: runCasaGrandeImoveis,
  },
  {
    nome: 'Diego Garcia Imóveis',
    origem: OrigemAnuncio.DIEGO_GARCIA_IMOVEIS,
    run: runDiegoGarciaImoveis,
  },
  {
    nome: 'AdimóveisBH',
    origem: OrigemAnuncio.ADIMOVEIS_BH,
    run: runAdimoveisBh,
  },
  {
    nome: 'Valore Imóveis',
    origem: OrigemAnuncio.VALORE_IMOVEIS,
    run: runValoreImoveis,
  },
  {
    nome: 'IVI Invista Imóveis',
    origem: OrigemAnuncio.IVI_INVISTA_IMOVEIS,
    run: runIviInvistaImoveis,
  },
  {
    nome: 'Real Imobiliária',
    origem: OrigemAnuncio.REAL_IMOBILIARIA,
    run: runRealImobiliaria,
  },
  // Cluster Kenlo (lote 2 de .claude/__workdir/integracao-lote/lotes.md) — as duas
  // usam HttpCrawler, sem browser, então não quebram o pareamento leve/pesado acima.
  {
    nome: 'JMC Imóveis',
    origem: OrigemAnuncio.JMC_IMOVEIS,
    run: runJmcImoveis,
  },
  {
    nome: 'Luxus Imóveis Premium',
    origem: OrigemAnuncio.LUXUS_IMOVEIS_PREMIUM,
    run: runLuxusImoveisPremium,
  },
];

interface FimExecucao {
  status: StatusExecucao;
  finalizadaEm: Date;
  requestsFinalizados?: number;
  requestsFalhos?: number;
  mensagemErro?: string;
  requestsTotal?: number;
  crawlerRuntimeMillis?: number;
  requestTotalDurationMillis?: number;
  requestAvgFinishedDurationMillis?: number;
  requestAvgFailedDurationMillis?: number;
  retryHistogram?: number[];
  anunciosEncontrados?: number;
  anunciosUnicosDetalhe?: number;
  capturasBrutasEnviadas?: number;
}

// Conexão aberta só pelo tempo da escrita, não pelo loop inteiro — e agora
// cada chamada cria seu próprio DataSource (createDataSource(), não um
// singleton compartilhado): com fontes rodando em paralelo (BATCH_SIZE > 1),
// duas chamadas concorrentes num DataSource só poderiam fechar a conexão
// uma da outra no meio do caminho. Entre uma fonte e outra o processo passa
// minutos só raspando, sem tocar no Postgres, e uma conexão ociosa por tempo
// demais é derrubada em silêncio pelo pooler do Supabase.
async function registrarInicioExecucao(origem: OrigemAnuncio): Promise<number> {
  const dataSource = createDataSource();
  await dataSource.initialize();
  try {
    const repo = dataSource.getRepository(Execucao);
    const execucao = await repo.save(
      repo.create({ origem, iniciadaEm: new Date() }),
    );
    return execucao.id;
  } finally {
    await dataSource.destroy();
  }
}

async function registrarFimExecucao(
  execucaoId: number,
  fim: FimExecucao,
): Promise<void> {
  const dataSource = createDataSource();
  await dataSource.initialize();
  try {
    await dataSource.getRepository(Execucao).update(execucaoId, fim);
  } finally {
    await dataSource.destroy();
  }
}

async function runFonte(fonte: Fonte, uploadMutex: Mutex): Promise<void> {
  log.info(`=== iniciando ${fonte.nome} ===`);
  const execucaoId = await registrarInicioExecucao(fonte.origem);
  try {
    const stats = await fonte.run(uploadMutex);
    await registrarFimExecucao(execucaoId, {
      status: StatusExecucao.SUCESSO,
      finalizadaEm: new Date(),
      requestsFinalizados: stats.requestsFinished,
      requestsFalhos: stats.requestsFailed,
      requestsTotal: stats.requestsTotal,
      crawlerRuntimeMillis: stats.crawlerRuntimeMillis,
      requestTotalDurationMillis: stats.requestTotalDurationMillis,
      requestAvgFinishedDurationMillis: stats.requestAvgFinishedDurationMillis,
      requestAvgFailedDurationMillis: stats.requestAvgFailedDurationMillis,
      retryHistogram: stats.retryHistogram,
      anunciosEncontrados: stats.anunciosEncontrados,
      anunciosUnicosDetalhe: stats.anunciosUnicosDetalhe,
      capturasBrutasEnviadas: stats.capturasBrutasEnviadas,
    });
    log.info(`=== ${fonte.nome} concluído ===`);
  } catch (error) {
    await registrarFimExecucao(execucaoId, {
      status: StatusExecucao.FALHA,
      finalizadaEm: new Date(),
      mensagemErro: error instanceof Error ? error.message : String(error),
    });
    Sentry.captureException(error, { tags: { fonte: fonte.origem } });
    log.error(`=== ${fonte.nome} falhou ===`, { error });
  }
}

/**
 * Lotes de BATCH_SIZE fontes por vez (default 1 — sequencial, idêntico ao
 * comportamento anterior). `runFonte` nunca relança (qualquer erro de fonte
 * é capturado e vira FALHA na própria Execucao), então `Promise.all` num
 * lote nunca aborta por causa de uma fonte com problema.
 */
async function main(): Promise<void> {
  // Compartilhado por toda a run (não só por lote): serializa o upload de
  // captura bruta entre fontes concorrentes, ver upload-mutex.ts. O Extract
  // (crawler.run) continua paralelo dentro do lote — só essa fase final,
  // que mexe no armazenamento local compartilhado do Crawlee, roda uma
  // fonte de cada vez.
  const uploadMutex = new Mutex();

  for (let i = 0; i < FONTES.length; i += BATCH_SIZE) {
    const lote = FONTES.slice(i, i + BATCH_SIZE);
    await Promise.all(lote.map((fonte) => runFonte(fonte, uploadMutex)));
  }

  await Sentry.close(2000);
}

await main();

// Confirmado na prática numa run completa: mesmo com todas as fontes
// concluídas e Sentry.close resolvido, o processo não saía sozinho — algum
// handle não liberado (Playwright/CDP ou o servidor HTTP local do Crawlee)
// segurava o event loop indefinidamente. process.exit explícito depois que o
// trabalho de verdade já terminou, em vez de depender do processo encerrar
// sozinho.
process.exit(0);
