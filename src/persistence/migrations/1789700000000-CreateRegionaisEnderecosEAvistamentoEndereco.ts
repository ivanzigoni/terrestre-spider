import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRegionaisEnderecosEAvistamentoEndereco1789700000000 implements MigrationInterface {
  name = 'CreateRegionaisEnderecosEAvistamentoEndereco1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- regionais ---
    await queryRunner.query(`
      CREATE TABLE "regionais" (
        "id" SERIAL NOT NULL,
        "nome" text NOT NULL,
        CONSTRAINT "UQ_regionais_nome" UNIQUE ("nome"),
        CONSTRAINT "PK_regionais" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`
      INSERT INTO "regionais" ("nome")
      SELECT DISTINCT "regional" FROM "bairros_regionais" ORDER BY 1`);

    // --- bairros_regionais.regional (texto) -> regional_id (FK) ---
    await queryRunner.query(
      `ALTER TABLE "bairros_regionais" ADD "regional_id" integer`,
    );
    await queryRunner.query(`
      UPDATE "bairros_regionais" br SET "regional_id" = r.id
      FROM "regionais" r WHERE r.nome = br.regional`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "bairros_regionais" WHERE "regional_id" IS NULL) THEN
          RAISE EXCEPTION 'migration abortada: bairros_regionais com regional_id nulo após backfill';
        END IF;
      END $$`);
    await queryRunner.query(
      `ALTER TABLE "bairros_regionais" ALTER COLUMN "regional_id" SET NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "bairros_regionais"
      ADD CONSTRAINT "FK_bairros_regionais_regional_id"
      FOREIGN KEY ("regional_id") REFERENCES "regionais"("id")`);
    await queryRunner.query(`
      CREATE INDEX "IDX_bairros_regionais_regional_id" ON "bairros_regionais" ("regional_id")`);
    await queryRunner.query(
      `ALTER TABLE "bairros_regionais" DROP COLUMN "regional"`,
    );

    // --- enderecos ---
    // Um único tipo lógico de linha ("endereço"), com dois "tipo"s: 'original' (bruto, como
    // veio do scraper — bairro em texto) e 'processado' (bairro resolvido para bairro_id; os
    // demais campos são copiados sem alteração do original, já que só o bairro é transformado
    // pela pipeline hoje).
    await queryRunner.query(`
      CREATE TABLE "enderecos" (
        "id" SERIAL NOT NULL,
        "tipo" text NOT NULL,
        "endereco" text,
        "numero" text,
        "bairro" text,
        "bairro_id" integer,
        "cidade" text,
        "estado" text,
        "cep" text,
        "latitude" double precision,
        "longitude" double precision,
        CONSTRAINT "PK_enderecos" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_enderecos_tipo" CHECK ("tipo" IN ('original','processado')),
        CONSTRAINT "CHK_enderecos_processado_sem_bairro_texto" CHECK ("tipo" <> 'processado' OR "bairro" IS NULL),
        CONSTRAINT "CHK_enderecos_original_sem_bairro_id" CHECK ("tipo" <> 'original' OR "bairro_id" IS NULL),
        CONSTRAINT "FK_enderecos_bairro" FOREIGN KEY ("bairro_id") REFERENCES "bairros_regionais"("id")
      )`);

    // Dedup das linhas 'original' já existentes em avistamentos (mais da metade dos
    // avistamentos repete endereço bruto idêntico entre recapturas do mesmo anúncio).
    await queryRunner.query(`
      INSERT INTO "enderecos" ("tipo", "endereco", "numero", "bairro", "cidade", "estado", "cep", "latitude", "longitude")
      SELECT 'original', "endereco", "numero", "bairro", "cidade", "estado", "cep", "latitude", "longitude"
      FROM "avistamentos"
      WHERE "bairro" IS NOT NULL OR "endereco" IS NOT NULL OR "numero" IS NOT NULL
         OR "cidade" IS NOT NULL OR "estado" IS NOT NULL OR "cep" IS NOT NULL
         OR "latitude" IS NOT NULL OR "longitude" IS NOT NULL
      GROUP BY "endereco", "numero", "bairro", "cidade", "estado", "cep", "latitude", "longitude"`);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_enderecos_original_dedup" ON "enderecos" (
        (COALESCE("endereco", '')), (COALESCE("numero", '')), (COALESCE("bairro", '')),
        (COALESCE("cidade", '')), (COALESCE("estado", '')), (COALESCE("cep", '')),
        (COALESCE("latitude"::text, '')), (COALESCE("longitude"::text, ''))
      ) WHERE "tipo" = 'original'`);

    // Verificação: cada bairro_normalizado precisa ter match exato em bairros_regionais.bairro
    // (deveria sempre valer, dado como normalizarBairro monta o resultado — checar mesmo assim).
    await queryRunner.query(`
      DO $$
      DECLARE unmatched int;
      BEGIN
        SELECT count(*) INTO unmatched FROM "avistamentos" a
        WHERE a."bairro_normalizado" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "bairros_regionais" br WHERE br."bairro" = a."bairro_normalizado");
        IF unmatched > 0 THEN
          RAISE EXCEPTION 'migration abortada: % avistamentos com bairro_normalizado sem match em bairros_regionais', unmatched;
        END IF;
      END $$`);

    // Dedup das linhas 'processado': mesma granularidade do 'original' (endereço inteiro),
    // só trocando bairro (texto) por bairro_id.
    await queryRunner.query(`
      INSERT INTO "enderecos" ("tipo", "endereco", "numero", "bairro_id", "cidade", "estado", "cep", "latitude", "longitude")
      SELECT 'processado', a."endereco", a."numero", br.id, a."cidade", a."estado", a."cep", a."latitude", a."longitude"
      FROM "avistamentos" a
      JOIN "bairros_regionais" br ON br."bairro" = a."bairro_normalizado"
      WHERE a."bairro_normalizado" IS NOT NULL
      GROUP BY a."endereco", a."numero", br.id, a."cidade", a."estado", a."cep", a."latitude", a."longitude"`);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_enderecos_processado_dedup" ON "enderecos" (
        (COALESCE("endereco", '')), (COALESCE("numero", '')), (COALESCE("bairro_id"::text, '')),
        (COALESCE("cidade", '')), (COALESCE("estado", '')), (COALESCE("cep", '')),
        (COALESCE("latitude"::text, '')), (COALESCE("longitude"::text, ''))
      ) WHERE "tipo" = 'processado'`);

    // --- avistamento_endereco ---
    await queryRunner.query(`
      CREATE TABLE "avistamento_endereco" (
        "id" SERIAL NOT NULL,
        "avistamento_id" integer NOT NULL,
        "endereco_id" integer NOT NULL,
        "tipo" text NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_avistamento_endereco" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_avistamento_endereco_tipo" CHECK ("tipo" IN ('original','processado')),
        CONSTRAINT "UQ_avistamento_endereco_avistamento_tipo" UNIQUE ("avistamento_id", "tipo"),
        CONSTRAINT "FK_avistamento_endereco_avistamento" FOREIGN KEY ("avistamento_id")
          REFERENCES "avistamentos"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_avistamento_endereco_endereco" FOREIGN KEY ("endereco_id")
          REFERENCES "enderecos"("id")
      )`);
    await queryRunner.query(`
      CREATE INDEX "IDX_avistamento_endereco_endereco_id" ON "avistamento_endereco" ("endereco_id")`);

    await queryRunner.query(`
      INSERT INTO "avistamento_endereco" ("avistamento_id", "endereco_id", "tipo")
      SELECT a.id, e.id, 'original'
      FROM "avistamentos" a
      JOIN "enderecos" e ON e."tipo" = 'original'
        AND e."endereco" IS NOT DISTINCT FROM a."endereco"
        AND e."numero" IS NOT DISTINCT FROM a."numero"
        AND e."bairro" IS NOT DISTINCT FROM a."bairro"
        AND e."cidade" IS NOT DISTINCT FROM a."cidade"
        AND e."estado" IS NOT DISTINCT FROM a."estado"
        AND e."cep" IS NOT DISTINCT FROM a."cep"
        AND e."latitude" IS NOT DISTINCT FROM a."latitude"
        AND e."longitude" IS NOT DISTINCT FROM a."longitude"
      WHERE a."bairro" IS NOT NULL OR a."endereco" IS NOT NULL OR a."numero" IS NOT NULL
         OR a."cidade" IS NOT NULL OR a."estado" IS NOT NULL OR a."cep" IS NOT NULL
         OR a."latitude" IS NOT NULL OR a."longitude" IS NOT NULL`);

    await queryRunner.query(`
      INSERT INTO "avistamento_endereco" ("avistamento_id", "endereco_id", "tipo")
      SELECT a.id, e.id, 'processado'
      FROM "avistamentos" a
      JOIN "bairros_regionais" br ON br."bairro" = a."bairro_normalizado"
      JOIN "enderecos" e ON e."tipo" = 'processado'
        AND e."bairro_id" = br.id
        AND e."endereco" IS NOT DISTINCT FROM a."endereco"
        AND e."numero" IS NOT DISTINCT FROM a."numero"
        AND e."cidade" IS NOT DISTINCT FROM a."cidade"
        AND e."estado" IS NOT DISTINCT FROM a."estado"
        AND e."cep" IS NOT DISTINCT FROM a."cep"
        AND e."latitude" IS NOT DISTINCT FROM a."latitude"
        AND e."longitude" IS NOT DISTINCT FROM a."longitude"
      WHERE a."bairro_normalizado" IS NOT NULL`);

    // --- avistamentos.regional (texto) -> regional_id (FK) ---
    await queryRunner.query(
      `ALTER TABLE "avistamentos" ADD "regional_id" integer`,
    );
    await queryRunner.query(`
      UPDATE "avistamentos" a SET "regional_id" = r.id
      FROM "regionais" r WHERE r.nome = a."regional"`);
    await queryRunner.query(`
      DO $$
      DECLARE unmatched int;
      BEGIN
        SELECT count(*) INTO unmatched FROM "avistamentos"
        WHERE "regional" IS NOT NULL AND "regional_id" IS NULL;
        IF unmatched > 0 THEN
          RAISE EXCEPTION 'migration abortada: % avistamentos com regional preenchida sem match em regionais', unmatched;
        END IF;
      END $$`);
    await queryRunner.query(`
      ALTER TABLE "avistamentos"
      ADD CONSTRAINT "FK_avistamentos_regional_id" FOREIGN KEY ("regional_id") REFERENCES "regionais"("id")`);
    await queryRunner.query(`
      CREATE INDEX "IDX_avistamentos_regional_id" ON "avistamentos" ("regional_id")`);

    // --- verificação final: toda linha de avistamentos com dado de endereço/bairro precisa
    // ter virado um link em avistamento_endereco, sem sobra nem falta ---
    await queryRunner.query(`
      DO $$
      DECLARE esperado_original int; obtido_original int;
              esperado_processado int; obtido_processado int;
      BEGIN
        SELECT count(*) INTO esperado_original FROM "avistamentos"
        WHERE "bairro" IS NOT NULL OR "endereco" IS NOT NULL OR "numero" IS NOT NULL
           OR "cidade" IS NOT NULL OR "estado" IS NOT NULL OR "cep" IS NOT NULL
           OR "latitude" IS NOT NULL OR "longitude" IS NOT NULL;
        SELECT count(*) INTO obtido_original FROM "avistamento_endereco" WHERE "tipo" = 'original';
        SELECT count(*) INTO esperado_processado FROM "avistamentos" WHERE "bairro_normalizado" IS NOT NULL;
        SELECT count(*) INTO obtido_processado FROM "avistamento_endereco" WHERE "tipo" = 'processado';
        IF esperado_original <> obtido_original OR esperado_processado <> obtido_processado THEN
          RAISE EXCEPTION 'migration abortada: contagem de avistamento_endereco não bate (original % vs %, processado % vs %)',
            esperado_original, obtido_original, esperado_processado, obtido_processado;
        END IF;
      END $$`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "avistamentos" DROP CONSTRAINT "FK_avistamentos_regional_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_avistamentos_regional_id"`);
    await queryRunner.query(
      `ALTER TABLE "avistamentos" DROP COLUMN "regional_id"`,
    );
    await queryRunner.query(`DROP TABLE "avistamento_endereco"`);
    await queryRunner.query(`DROP TABLE "enderecos"`);
    await queryRunner.query(
      `ALTER TABLE "bairros_regionais" ADD "regional" text`,
    );
    await queryRunner.query(`
      UPDATE "bairros_regionais" br SET "regional" = r.nome
      FROM "regionais" r WHERE r.id = br."regional_id"`);
    await queryRunner.query(
      `ALTER TABLE "bairros_regionais" ALTER COLUMN "regional" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "bairros_regionais" DROP CONSTRAINT "FK_bairros_regionais_regional_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_bairros_regionais_regional_id"`);
    await queryRunner.query(
      `ALTER TABLE "bairros_regionais" DROP COLUMN "regional_id"`,
    );
    await queryRunner.query(`DROP TABLE "regionais"`);
  }
}
