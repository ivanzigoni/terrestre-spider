import path from 'node:path';
import { fileURLToPath } from 'node:url';

import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { Anuncio } from './entities/anuncio.entity.js';
import { Avistamento } from './entities/avistamento.entity.js';
import { CapturaBruta } from './entities/captura-bruta.entity.js';
import { ExecucaoProcessamento } from './entities/execucao-processamento.entity.js';
import { Execucao } from './entities/execucao.entity.js';
import { requireEnv } from './require-env.js';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
// Roda via tsx em dev (.ts direto) e via dist/ compilado em prod — a extensão deste
// próprio arquivo já compilado diz qual das duas situações estamos, sem precisar de
// uma env var separada só para isso.
const migrationExtension = currentFilePath.endsWith('.ts') ? 'ts' : 'js';

/**
 * Fábrica, não singleton: com runs paralelas (`SPIDER_BATCH_SIZE` > 1) rodando
 * ao mesmo tempo, cada uma precisa da sua própria conexão — um `DataSource`
 * compartilhado quebraria se uma run chamasse `destroy()` enquanto outra
 * ainda estivesse com `initialize()` em andamento (as duas mexeriam no mesmo
 * objeto). Cada chamador cria a sua, inicializa, usa, destrói — sem estado
 * compartilhado entre runs concorrentes.
 */
export function createDataSource(): DataSource {
  // Schema dedicado deste serviço no Postgres compartilhado (ver glossário do workspace:
  // o banco "terrestre" tem um schema por aplicação — pagamentos, terra-em-foco,
  // terrestre). Obrigatório, sem default: nunca cai em "public" por omissão. Vale tanto
  // para o SQL gerado pelo TypeORM a partir das entidades (opção `schema` abaixo)
  // quanto para o SQL bruto já existente nas migrations mais antigas, que não qualifica
  // schema explicitamente — `search_path` (em `extra.options`) cobre esse caso.
  const schema = requireEnv('POSTGRES_SCHEMA');

  return new DataSource({
    type: 'postgres',
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    username: requireEnv('POSTGRES_USER'),
    password: requireEnv('POSTGRES_PASSWORD'),
    database: requireEnv('POSTGRES_DB'),
    schema,
    // TLS é exigência de provedores de Postgres gerenciado (ex.: Supabase, proxy do
    // Railway), não do Postgres em si — por isso fica numa chave própria em vez de
    // parecer parte da conexão genérica. Esses provedores tipicamente assinam com CA
    // própria, fora do truststore padrão do Node; sem pinning dela no projeto,
    // rejectUnauthorized fica desligado — conexão segue criptografada, mas sem verificar
    // a identidade do servidor.
    ssl:
      process.env.POSTGRES_SSL === 'true'
        ? { rejectUnauthorized: false }
        : false,
    // Sem timeout, uma query que trava por instabilidade de rede fica pendurada pra sempre
    // (diagnosticado ao vivo: sessão presa em "idle in transaction" minutos depois do SELECT
    // do upsert, sem nunca completar). query_timeout é do lado do cliente (pg) e força o
    // fechamento do socket se a query não responder a tempo; statement_timeout e
    // idle_in_transaction_session_timeout são limites do próprio Postgres. `options` fixa
    // o search_path da sessão só para este schema — sem isso, um `CREATE TABLE`/`ALTER
    // TYPE` sem schema explícito (padrão das migrations mais antigas) resolveria contra o
    // search_path default da role, que pode incluir "public".
    extra: {
      options: `-c search_path=${schema}`,
      query_timeout: 30_000,
      statement_timeout: 30_000,
      idle_in_transaction_session_timeout: 30_000,
    },
    entities: [
      Execucao,
      CapturaBruta,
      Anuncio,
      Avistamento,
      ExecucaoProcessamento,
    ],
    migrations: [
      path.join(currentDirPath, 'migrations', `*.${migrationExtension}`),
    ],
    synchronize: false,
  });
}

// TypeORM CLI (migration:run/generate/revert, ver package.json) espera uma
// instância pronta exportada como default, não uma fábrica — único consumidor
// que ainda precisa do padrão singleton.
export default createDataSource();
