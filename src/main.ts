import * as Sentry from '@sentry/node';
import { log } from 'crawlee';

import { createDataSource } from './persistence/data-source.js';
import { Execucao } from './persistence/entities/execucao.entity.js';
import { OrigemAnuncio } from './persistence/enums/origem-anuncio.enum.js';
import { StatusExecucao } from './persistence/enums/status-execucao.enum.js';
import { Mutex } from './persistence/upload-mutex.js';
import { runAdimoveisBh } from './sources/adimoveis-bh/main.js';
import { runCasaGrandeImoveis } from './sources/casa-grande-imoveis/main.js';
import { runCasaMineira } from './sources/casa-mineira/main.js';
import { runCasaPampulhaImoveis } from './sources/casa-pampulha-imoveis/main.js';
import { runChaveCertaImoveisBh } from './sources/chave-certa-imoveis-bh/main.js';
import { runDiegoGarciaImoveis } from './sources/diego-garcia-imoveis/main.js';
import { runGsaAtivos } from './sources/gsa-ativos/main.js';
import { runHabitarPampulha } from './sources/habitar-pampulha/main.js';
import { runImobiliariaBuritis } from './sources/imobiliaria-buritis/main.js';
import { runImobiliariaPampulha } from './sources/imobiliaria-pampulha/main.js';
import { runImovelweb } from './sources/imovelweb/main.js';
import { runIviInvistaImoveis } from './sources/ivi-invista-imoveis/main.js';
import { runJmcImoveis } from './sources/jmc-imoveis/main.js';
import { runLiderarImoveis } from './sources/liderar-imoveis/main.js';
import { runLimaImoveisBarreiro } from './sources/lima-imoveis-barreiro/main.js';
import { runLuxusImoveisPremium } from './sources/luxus-imoveis-premium/main.js';
import { runModeloImovel } from './sources/modelo-imovel/main.js';
import { runMyBrokerBeloHorizonte } from './sources/my-broker-belo-horizonte/main.js';
import { runNetimoveis } from './sources/netimoveis/main.js';
import { runOlx } from './sources/olx/main.js';
import { runPrimerImoveis } from './sources/primer-imoveis/main.js';
import { runQuintoAndar } from './sources/quinto-andar/main.js';
import { runRealImobiliaria } from './sources/real-imobiliaria/main.js';
import { runRealImoveisPampulha } from './sources/real-imoveis-pampulha/main.js';
import { runSevenImoveis } from './sources/seven-imoveis/main.js';
import {
  BATCH_SIZE,
  NO_BROWSER_BATCH_SIZE,
} from './sources/shared/crawler-defaults.js';
import { runStiloNetimoveis } from './sources/stilo-netimoveis/main.js';
import { runStruturalImobiliaria } from './sources/strutural-imobiliaria/main.js';
import { runTopmigImoveis } from './sources/topmig-imoveis/main.js';
import { runValoreImoveis } from './sources/valore-imoveis/main.js';
import { runVendaNovaImoveis } from './sources/venda-nova-imoveis/main.js';
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
  usaBrowser: boolean;
  run: (uploadMutex: Mutex) => Promise<ExecucaoStats>;
}

const FONTES: Fonte[] = [
  { nome: 'OLX', origem: OrigemAnuncio.OLX, usaBrowser: false, run: runOlx },
  {
    nome: 'ZAP Imóveis',
    origem: OrigemAnuncio.ZAP_IMOVEIS,
    usaBrowser: true,
    run: runZapImoveis,
  },
  {
    nome: 'Viva Real',
    origem: OrigemAnuncio.VIVA_REAL,
    usaBrowser: false,
    run: runVivaReal,
  },
  {
    nome: 'Netimóveis',
    origem: OrigemAnuncio.NETIMOVEIS,
    usaBrowser: true,
    run: runNetimoveis,
  },
  {
    nome: 'Quinto Andar',
    origem: OrigemAnuncio.QUINTO_ANDAR,
    usaBrowser: false,
    run: runQuintoAndar,
  },
  {
    nome: 'Imovelweb',
    origem: OrigemAnuncio.IMOVELWEB,
    usaBrowser: true,
    run: runImovelweb,
  },
  {
    nome: 'Imobiliária Buritis',
    origem: OrigemAnuncio.IMOBILIARIA_BURITIS,
    usaBrowser: false,
    run: runImobiliariaBuritis,
  },
  {
    nome: 'Liderar Imóveis',
    origem: OrigemAnuncio.LIDERAR_IMOVEIS,
    usaBrowser: true,
    run: runLiderarImoveis,
  },
  {
    nome: 'Casa Grande Imóveis',
    origem: OrigemAnuncio.CASA_GRANDE_IMOVEIS,
    usaBrowser: false,
    run: runCasaGrandeImoveis,
  },
  {
    nome: 'Diego Garcia Imóveis',
    origem: OrigemAnuncio.DIEGO_GARCIA_IMOVEIS,
    usaBrowser: true,
    run: runDiegoGarciaImoveis,
  },
  {
    nome: 'AdimóveisBH',
    origem: OrigemAnuncio.ADIMOVEIS_BH,
    usaBrowser: false,
    run: runAdimoveisBh,
  },
  {
    nome: 'Valore Imóveis',
    origem: OrigemAnuncio.VALORE_IMOVEIS,
    usaBrowser: true,
    run: runValoreImoveis,
  },
  {
    nome: 'IVI Invista Imóveis',
    origem: OrigemAnuncio.IVI_INVISTA_IMOVEIS,
    usaBrowser: true,
    run: runIviInvistaImoveis,
  },
  {
    nome: 'Real Imobiliária',
    origem: OrigemAnuncio.REAL_IMOBILIARIA,
    usaBrowser: true,
    run: runRealImobiliaria,
  },
  {
    nome: 'JMC Imóveis',
    origem: OrigemAnuncio.JMC_IMOVEIS,
    usaBrowser: false,
    run: runJmcImoveis,
  },
  {
    nome: 'Luxus Imóveis Premium',
    origem: OrigemAnuncio.LUXUS_IMOVEIS_PREMIUM,
    usaBrowser: false,
    run: runLuxusImoveisPremium,
  },
  {
    nome: 'Casa Pampulha Imóveis',
    origem: OrigemAnuncio.CASA_PAMPULHA_IMOVEIS,
    usaBrowser: true,
    run: runCasaPampulhaImoveis,
  },
  {
    nome: 'Habitar Pampulha',
    origem: OrigemAnuncio.HABITAR_PAMPULHA,
    usaBrowser: true,
    run: runHabitarPampulha,
  },
  {
    nome: 'Modelo Imóvel',
    origem: OrigemAnuncio.MODELO_IMOVEL,
    usaBrowser: true,
    run: runModeloImovel,
  },
  {
    nome: 'Primer Imóveis',
    origem: OrigemAnuncio.PRIMER_IMOVEIS,
    usaBrowser: true,
    run: runPrimerImoveis,
  },
  {
    nome: 'Real Imóveis Pampulha',
    origem: OrigemAnuncio.REAL_IMOVEIS_PAMPULHA,
    usaBrowser: true,
    run: runRealImoveisPampulha,
  },
  {
    nome: 'Lima Imóveis Barreiro',
    origem: OrigemAnuncio.LIMA_IMOVEIS_BARREIRO,
    usaBrowser: true,
    run: runLimaImoveisBarreiro,
  },
  {
    nome: 'Seven Imóveis',
    origem: OrigemAnuncio.SEVEN_IMOVEIS,
    usaBrowser: true,
    run: runSevenImoveis,
  },
  {
    nome: 'TOPMIG Imóveis',
    origem: OrigemAnuncio.TOPMIG_IMOVEIS,
    usaBrowser: true,
    run: runTopmigImoveis,
  },
  {
    nome: 'Venda Nova Imóveis',
    origem: OrigemAnuncio.VENDA_NOVA_IMOVEIS,
    usaBrowser: true,
    run: runVendaNovaImoveis,
  },
  {
    nome: 'Strutural Imobiliária',
    origem: OrigemAnuncio.STRUTURAL_IMOBILIARIA,
    usaBrowser: true,
    run: runStruturalImobiliaria,
  },
  {
    nome: 'Chave Certa Imóveis BH',
    origem: OrigemAnuncio.CHAVE_CERTA_IMOVEIS_BH,
    usaBrowser: false,
    run: runChaveCertaImoveisBh,
  },
  {
    nome: 'GSA Ativos',
    origem: OrigemAnuncio.GSA_ATIVOS,
    usaBrowser: false,
    run: runGsaAtivos,
  },
  {
    nome: 'Imobiliária Pampulha',
    origem: OrigemAnuncio.IMOBILIARIA_PAMPULHA,
    usaBrowser: true,
    run: runImobiliariaPampulha,
  },
  {
    nome: 'Casa Mineira',
    origem: OrigemAnuncio.CASA_MINEIRA,
    usaBrowser: false,
    run: runCasaMineira,
  },
  {
    nome: 'Stilo Netimóveis',
    origem: OrigemAnuncio.STILO_NETIMOVEIS,
    usaBrowser: false,
    run: runStiloNetimoveis,
  },
  {
    nome: 'My Broker Belo Horizonte',
    origem: OrigemAnuncio.MY_BROKER_BELO_HORIZONTE,
    usaBrowser: false,
    run: runMyBrokerBeloHorizonte,
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
  linksEncontrados?: number;
  linksUnicosDetalhe?: number;
  capturasBrutasEnviadas?: number;
}

// Conexão aberta só pelo tempo da escrita, não pelo loop inteiro — e agora
// cada chamada cria seu próprio DataSource (createDataSource(), não um
// singleton compartilhado): com fontes rodando em paralelo (BATCH_SIZE > 1),
// duas chamadas concorrentes num DataSource só poderiam fechar a conexão
// uma da outra no meio do caminho. Entre uma fonte e outra o processo passa
// minutos só raspando, sem tocar no Postgres, e uma conexão ociosa por tempo
// demais é derrubada em silêncio pelo pooler do provedor gerenciado.
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
      linksEncontrados: stats.linksEncontrados,
      linksUnicosDetalhe: stats.linksUnicosDetalhe,
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
 * Roda um grupo de fontes em lotes de `tamanhoLote` por vez (default 1 —
 * sequencial). `runFonte` nunca relança (qualquer erro de fonte é capturado
 * e vira FALHA na própria Execucao), então `Promise.all` num lote nunca
 * aborta por causa de uma fonte com problema.
 */
async function runGrupo(
  fontes: Fonte[],
  tamanhoLote: number,
  uploadMutex: Mutex,
): Promise<void> {
  for (let i = 0; i < fontes.length; i += tamanhoLote) {
    const lote = fontes.slice(i, i + tamanhoLote);
    await Promise.all(lote.map((fonte) => runFonte(fonte, uploadMutex)));
  }
}

/**
 * Dois grupos com concorrência independente: fontes sem browser
 * (CheerioCrawler/HttpCrawler, sem custo de RAM de browser headless) via
 * SPIDER_NO_BROWSER_BATCH_SIZE, fontes com PlaywrightCrawler via
 * SPIDER_BATCH_SIZE — ver crawler-defaults.ts para o piso/disciplina de cada
 * uma. SPIDER_SKIP_BROWSER_FONTES=true pula o segundo grupo inteiro, útil
 * para testar ou operar isoladamente o grupo sem browser.
 */
async function main(): Promise<void> {
  // Compartilhado por toda a run (não só por lote): serializa o upload de
  // captura bruta entre fontes concorrentes, ver upload-mutex.ts. O Extract
  // (crawler.run) continua paralelo dentro do lote — só essa fase final,
  // que mexe no armazenamento local compartilhado do Crawlee, roda uma
  // fonte de cada vez.
  const uploadMutex = new Mutex();

  const semBrowser = FONTES.filter((fonte) => !fonte.usaBrowser);
  const comBrowser = FONTES.filter((fonte) => fonte.usaBrowser);

  await runGrupo(semBrowser, NO_BROWSER_BATCH_SIZE, uploadMutex);

  if (process.env.SPIDER_SKIP_BROWSER_FONTES !== 'true') {
    await runGrupo(comBrowser, BATCH_SIZE, uploadMutex);
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
