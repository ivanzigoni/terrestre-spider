import type { Dataset } from 'crawlee';
import { log } from 'crawlee';
import type { DataSource } from 'typeorm';

import { BASE_BACKOFF_MS, MAX_BACKOFF_MS } from '../sources/shared/backoff.js';
import { CapturaBruta } from './entities/captura-bruta.entity.js';
import { FormatoCaptura } from './enums/formato-captura.enum.js';
import type { OrigemAnuncio } from './enums/origem-anuncio.enum.js';
import type { TipoPaginaCaptura } from './enums/tipo-pagina-captura.enum.js';
import type { TipoTransacao } from './enums/tipo-transacao.enum.js';
import type { RawCaptureItem } from './raw-capture-item.js';
import {
  computeContentHash,
  ensureBucketExists,
  getS3Client,
  uploadObject,
} from './s3-client.js';

// Mesmo valor de load.ts, por consistência — na prática o volume de páginas por
// execução é bem menor que o de anúncios.
const BATCH_SIZE = 500;
const MAX_UPLOAD_RETRIES = 2;
const MAX_INSERT_RETRIES = 2;
const DEFAULT_BUCKET = 'terrestre-capturas-brutas';

interface CapturaParaInserir {
  origem: OrigemAnuncio;
  tipoTransacao: TipoTransacao | null;
  tipoPagina: TipoPaginaCaptura;
  formato: FormatoCaptura;
  url: string;
  bucket: string;
  chaveObjeto: string;
  hashConteudo: string;
  tamanhoBytes: number;
  capturadoEm: Date;
}

function resolveContentType(formato: FormatoCaptura): string {
  return formato === FormatoCaptura.HTML
    ? 'text/html; charset=utf-8'
    : 'application/json; charset=utf-8';
}

function resolveExtensao(formato: FormatoCaptura): string {
  return formato === FormatoCaptura.HTML ? 'html' : 'json';
}

/**
 * `{origem}/{tipoTransacao ou 'geral'}/{data}/{timestamp}-{hash8}.{ext}` — particionado
 * por origem/tipo/data pra leitura humana no bucket, com o prefixo do hash garantindo
 * unicidade mesmo com duas capturas no mesmo milissegundo.
 */
function montarChaveObjeto(item: RawCaptureItem, hashConteudo: string): string {
  const data = item.capturadoEm.slice(0, 10);
  const timestamp = item.capturadoEm.replace(/[:.]/g, '-');
  const segmentoTransacao = item.tipoTransacao ?? 'geral';
  const extensao = resolveExtensao(item.formato);
  return `${item.origem}/${segmentoTransacao}/${data}/${timestamp}-${hashConteudo.slice(0, 8)}.${extensao}`;
}

async function uploadWithRetry(
  client: ReturnType<typeof getS3Client>,
  bucket: string,
  params: { key: string; body: string; contentType: string },
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await uploadObject(client, bucket, params);
      return;
    } catch (error) {
      if (attempt >= MAX_UPLOAD_RETRIES) throw error;
      const delayMs = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      log.warning(
        `load-raw-captures: upload de "${params.key}" falhou (tentativa ${String(attempt + 1)}/${String(MAX_UPLOAD_RETRIES + 1)}), retry em ${String(delayMs)}ms`,
        { error },
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function insertBatchWithRetry(
  dataSource: DataSource,
  items: CapturaParaInserir[],
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await dataSource
        .createQueryBuilder()
        .insert()
        .into(CapturaBruta)
        .values(items)
        .execute();
      return;
    } catch (error) {
      if (attempt >= MAX_INSERT_RETRIES) throw error;
      const delayMs = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      log.warning(
        `load-raw-captures: lote de ${String(items.length)} captura(s) falhou (tentativa ${String(attempt + 1)}/${String(MAX_INSERT_RETRIES + 1)}), retry em ${String(delayMs)}ms`,
        { error },
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Fase 1: só S3, sem tocar Postgres — deliberadamente separada de
 * `inserirCapturasBrutas` pra não manter uma conexão Postgres aberta durante o upload
 * (I/O de rede que pode levar minutos), reabrindo o problema que `loadIntoPostgres` já
 * resolveu (pooler do Supabase derruba conexão ociosa).
 */
export async function uploadCapturasBrutas(
  dataset: Dataset<RawCaptureItem>,
): Promise<CapturaParaInserir[]> {
  const client = getS3Client();
  const bucket = process.env.S3_BUCKET_CAPTURAS_BRUTAS ?? DEFAULT_BUCKET;
  await ensureBucketExists(client, bucket);

  const resultado: CapturaParaInserir[] = [];
  await dataset.forEach(async (item) => {
    const hashConteudo = computeContentHash(item.conteudo);
    const chaveObjeto = montarChaveObjeto(item, hashConteudo);
    await uploadWithRetry(client, bucket, {
      key: chaveObjeto,
      body: item.conteudo,
      contentType: resolveContentType(item.formato),
    });
    resultado.push({
      origem: item.origem,
      tipoTransacao: item.tipoTransacao,
      tipoPagina: item.tipoPagina,
      formato: item.formato,
      url: item.url,
      bucket,
      chaveObjeto,
      hashConteudo,
      tamanhoBytes: Buffer.byteLength(item.conteudo, 'utf-8'),
      capturadoEm: new Date(item.capturadoEm),
    });
  });

  log.info(
    `load-raw-captures: ${String(resultado.length)} página(s) enviada(s) ao bucket "${bucket}"`,
  );
  return resultado;
}

/**
 * Fase 2: só Postgres, insert em lote com retry (mesmo formato de backoff exponencial
 * de `upsertBatchWithRetry` em load.ts). Sempre linha nova — sem upsert.
 */
export async function inserirCapturasBrutas(
  itens: CapturaParaInserir[],
  dataSource: DataSource,
): Promise<void> {
  for (let i = 0; i < itens.length; i += BATCH_SIZE) {
    await insertBatchWithRetry(dataSource, itens.slice(i, i + BATCH_SIZE));
  }
  log.info(
    `load-raw-captures: ${String(itens.length)} captura(s) registrada(s) em capturas_brutas`,
  );
}
