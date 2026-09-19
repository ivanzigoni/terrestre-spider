import type { EntityManager } from 'typeorm';

export interface CamposEnderecoComuns {
  endereco: string | null;
  numero: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface LinhaId {
  id: number;
}

/**
 * Acha-ou-cria a linha `enderecos` tipo 'original', deduplicada pelas 8 colunas (índice único
 * parcial `UQ_enderecos_original_dedup`). `ON CONFLICT ... DO NOTHING` + `SELECT` de fallback —
 * nunca SELECT-then-INSERT — porque várias `processarCaptura` do mesmo anúncio rodam em
 * transações concorrentes no mesmo lote (`Promise.allSettled`), e um SELECT prévio seguido de
 * INSERT condicional no código da aplicação é uma race clássica sob duas transações paralelas.
 * Retorna `null` quando não há nenhum dado de endereço/bairro bruto (nenhuma das 8 colunas
 * preenchida) — esse avistamento simplesmente não gera linha "original".
 */
export async function encontrarOuCriarEnderecoOriginal(
  manager: EntityManager,
  campos: CamposEnderecoComuns & { bairro: string | null },
): Promise<number | null> {
  const semDado =
    campos.endereco === null &&
    campos.numero === null &&
    campos.bairro === null &&
    campos.cidade === null &&
    campos.estado === null &&
    campos.cep === null &&
    campos.latitude === null &&
    campos.longitude === null;
  if (semDado) return null;

  const valores = [
    campos.endereco,
    campos.numero,
    campos.bairro,
    campos.cidade,
    campos.estado,
    campos.cep,
    campos.latitude,
    campos.longitude,
  ];

  const inseridas = await manager.query<LinhaId[]>(
    `INSERT INTO "enderecos" ("tipo", "endereco", "numero", "bairro", "cidade", "estado", "cep", "latitude", "longitude")
     VALUES ('original', $1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (
       (COALESCE("endereco", '')), (COALESCE("numero", '')), (COALESCE("bairro", '')),
       (COALESCE("cidade", '')), (COALESCE("estado", '')), (COALESCE("cep", '')),
       (COALESCE("latitude"::text, '')), (COALESCE("longitude"::text, ''))
     ) WHERE "tipo" = 'original'
     DO NOTHING
     RETURNING "id"`,
    valores,
  );
  if (inseridas[0] !== undefined) return inseridas[0].id;

  const existentes = await manager.query<LinhaId[]>(
    `SELECT "id" FROM "enderecos"
     WHERE "tipo" = 'original'
       AND "endereco" IS NOT DISTINCT FROM $1
       AND "numero" IS NOT DISTINCT FROM $2
       AND "bairro" IS NOT DISTINCT FROM $3
       AND "cidade" IS NOT DISTINCT FROM $4
       AND "estado" IS NOT DISTINCT FROM $5
       AND "cep" IS NOT DISTINCT FROM $6
       AND "latitude" IS NOT DISTINCT FROM $7
       AND "longitude" IS NOT DISTINCT FROM $8
     LIMIT 1`,
    valores,
  );
  const existente = existentes[0];
  if (existente === undefined) {
    throw new Error(
      'encontrarOuCriarEnderecoOriginal: inserção e busca de fallback falharam para o mesmo endereço',
    );
  }
  return existente.id;
}

/**
 * Acha-ou-cria a linha `enderecos` tipo 'processado' — mesmo padrão de
 * `encontrarOuCriarEnderecoOriginal`, trocando `bairro` (texto) por `bairroId` (resolvido).
 * Os demais campos são copiados sem alteração do original, já que só o bairro é transformado
 * pela pipeline hoje.
 */
export async function encontrarOuCriarEnderecoProcessado(
  manager: EntityManager,
  bairroId: number,
  campos: CamposEnderecoComuns,
): Promise<number> {
  const valores = [
    campos.endereco,
    campos.numero,
    bairroId,
    campos.cidade,
    campos.estado,
    campos.cep,
    campos.latitude,
    campos.longitude,
  ];

  const inseridas = await manager.query<LinhaId[]>(
    `INSERT INTO "enderecos" ("tipo", "endereco", "numero", "bairro_id", "cidade", "estado", "cep", "latitude", "longitude")
     VALUES ('processado', $1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (
       (COALESCE("endereco", '')), (COALESCE("numero", '')), (COALESCE("bairro_id"::text, '')),
       (COALESCE("cidade", '')), (COALESCE("estado", '')), (COALESCE("cep", '')),
       (COALESCE("latitude"::text, '')), (COALESCE("longitude"::text, ''))
     ) WHERE "tipo" = 'processado'
     DO NOTHING
     RETURNING "id"`,
    valores,
  );
  if (inseridas[0] !== undefined) return inseridas[0].id;

  const existentes = await manager.query<LinhaId[]>(
    `SELECT "id" FROM "enderecos"
     WHERE "tipo" = 'processado'
       AND "bairro_id" = $3
       AND "endereco" IS NOT DISTINCT FROM $1
       AND "numero" IS NOT DISTINCT FROM $2
       AND "cidade" IS NOT DISTINCT FROM $4
       AND "estado" IS NOT DISTINCT FROM $5
       AND "cep" IS NOT DISTINCT FROM $6
       AND "latitude" IS NOT DISTINCT FROM $7
       AND "longitude" IS NOT DISTINCT FROM $8
     LIMIT 1`,
    valores,
  );
  const existente = existentes[0];
  if (existente === undefined) {
    throw new Error(
      'encontrarOuCriarEnderecoProcessado: inserção e busca de fallback falharam para o mesmo endereço',
    );
  }
  return existente.id;
}
