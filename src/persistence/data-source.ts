import path from 'node:path';
import { fileURLToPath } from 'node:url';

import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { CapturaBruta } from './entities/captura-bruta.entity.js';
import { Execucao } from './entities/execucao.entity.js';

// `Anuncio`/`ObservacaoPreco` saíram daqui quando as tabelas foram
// descontinuadas (ver migration DropAnunciosTables) — com `synchronize:
// false`, mantê-las listadas sem tabela por trás faria um futuro
// `migration:generate` propor recriá-las, achando que é drift não
// intencional. As classes de entidade continuam no repositório como código
// morto, mais fácil de religar quando "por ora" acabar.

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
// Roda via tsx em dev (.ts direto) e via dist/ compilado em prod — a extensão deste
// próprio arquivo já compilado diz qual das duas situações estamos, sem precisar de
// uma env var separada só para isso.
const migrationExtension = currentFilePath.endsWith('.ts') ? 'ts' : 'js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

/**
 * Fábrica, não singleton: com runs paralelas (`SPIDER_BATCH_SIZE` > 1) rodando
 * ao mesmo tempo, cada uma precisa da sua própria conexão — um `DataSource`
 * compartilhado quebraria se uma run chamasse `destroy()` enquanto outra
 * ainda estivesse com `initialize()` em andamento (as duas mexeriam no mesmo
 * objeto). Cada chamador cria a sua, inicializa, usa, destrói — sem estado
 * compartilhado entre runs concorrentes.
 */
export function createDataSource(): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    username: requireEnv('POSTGRES_USER'),
    password: requireEnv('POSTGRES_PASSWORD'),
    database: requireEnv('POSTGRES_DB'),
    // SSL é exigência do Supabase, não do Postgres em si — fica numa chave com prefixo
    // próprio em vez de "POSTGRES_SSL" para não parecer parte da conexão genérica.
    // Supabase assina com CA própria ("Supabase Root 2021 CA"), fora do truststore padrão
    // do Node; sem pinning dela no projeto, rejectUnauthorized fica desligado — conexão
    // segue criptografada, mas sem verificar a identidade do servidor.
    ssl:
      process.env.SUPABASE_SSL === 'true'
        ? { rejectUnauthorized: false }
        : false,
    // Sem timeout, uma query que trava por instabilidade de rede fica pendurada pra sempre
    // (diagnosticado ao vivo: sessão presa em "idle in transaction" minutos depois do SELECT
    // do upsert, sem nunca completar). query_timeout é do lado do cliente (pg) e força o
    // fechamento do socket se a query não responder a tempo; statement_timeout e
    // idle_in_transaction_session_timeout são limites do próprio Postgres.
    extra: {
      query_timeout: 30_000,
      statement_timeout: 30_000,
      idle_in_transaction_session_timeout: 30_000,
    },
    entities: [Execucao, CapturaBruta],
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
