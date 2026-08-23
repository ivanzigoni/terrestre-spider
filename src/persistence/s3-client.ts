import { createHash } from 'node:crypto';

import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

let cachedClient: S3Client | undefined;

/**
 * Sem S3_ENDPOINT setada, o SDK resolve o endpoint real da AWS sozinho (comportamento
 * default documentado) — só é setada em dev local, apontando pro MinIO.
 * forcePathStyle é exigência do MinIO (endereçamento path-style); AWS real não
 * precisa e resolve por virtual-hosted-style normalmente, então fica amarrado à presença
 * do endpoint custom em vez de virar uma env var própria.
 */
export function getS3Client(): S3Client {
  if (cachedClient !== undefined) return cachedClient;

  const endpoint = process.env.S3_ENDPOINT;
  cachedClient = new S3Client({
    region: process.env.AWS_REGION ?? 'us-east-1',
    ...(endpoint !== undefined && { endpoint }),
    forcePathStyle: endpoint !== undefined,
  });
  return cachedClient;
}

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { $metadata?: { httpStatusCode?: unknown } };
  return candidate.$metadata?.httpStatusCode === 404;
}

/**
 * Idempotente: HeadBucket confirma se já existe, CreateBucket só roda se faltando.
 * Contra AWS real já provisionado via IaC, HeadBucket sempre confirma e CreateBucket
 * nunca é chamado — mesmo comportamento contra MinIO (onde precisa criar) e AWS
 * real (onde só confirma).
 */
export async function ensureBucketExists(
  client: S3Client,
  bucket: string,
): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

export function computeContentHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

export interface UploadObjectParams {
  key: string;
  body: string;
  contentType: string;
}

export async function uploadObject(
  client: S3Client,
  bucket: string,
  params: UploadObjectParams,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: Buffer.from(params.body, 'utf-8'),
      ContentType: params.contentType,
    }),
  );
}
