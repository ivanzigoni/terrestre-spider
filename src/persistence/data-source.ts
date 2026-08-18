import path from 'node:path';
import { fileURLToPath } from 'node:url';

import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { Execucao } from './entities/execucao.entity.js';
import { Imovel } from './entities/imovel.entity.js';
import { ObservacaoPreco } from './entities/observacao-preco.entity.js';

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

export const AppDataSource = new DataSource({
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
    process.env.SUPABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [Imovel, ObservacaoPreco, Execucao],
  migrations: [
    path.join(currentDirPath, 'migrations', `*.${migrationExtension}`),
  ],
  synchronize: false,
});
