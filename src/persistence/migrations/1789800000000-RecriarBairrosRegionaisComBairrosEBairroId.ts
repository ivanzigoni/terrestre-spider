import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RecriarBairrosRegionaisComBairrosEBairroId1789800000000 implements MigrationInterface {
  name = 'RecriarBairrosRegionaisComBairrosEBairroId1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- bairros ---
    // Tabela própria pro bairro em si (hoje só "nome"; codigo/area_km2/perimetro_m/geometria
    // ficam nullable pra um backfill futuro a partir de dataset oficial de malha territorial,
    // fora do escopo desta migration). "bairros_regionais" deixa de carregar o nome do bairro
    // e passa a ser só a junção bairro-regional-território.
    await queryRunner.query(`
      CREATE TABLE "bairros" (
        "id" SERIAL NOT NULL,
        "nome" text NOT NULL,
        "codigo" text,
        "area_km2" double precision,
        "perimetro_m" double precision,
        "geometria" text,
        CONSTRAINT "PK_bairros" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bairros_nome" UNIQUE ("nome"),
        CONSTRAINT "UQ_bairros_codigo" UNIQUE ("codigo")
      )`);

    await queryRunner.query(`
      INSERT INTO "bairros" ("nome")
      SELECT "bairro" FROM "bairros_regionais" ORDER BY "id"`);

    // --- bairros_regionais.bairro (texto) -> bairro_id (FK) ---
    await queryRunner.query(
      `ALTER TABLE "bairros_regionais" ADD "bairro_id" integer`,
    );
    await queryRunner.query(`
      UPDATE "bairros_regionais" br SET "bairro_id" = b."id"
      FROM "bairros" b WHERE b."nome" = br."bairro"`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "bairros_regionais" WHERE "bairro_id" IS NULL) THEN
          RAISE EXCEPTION 'migration abortada: bairros_regionais com bairro_id nulo após backfill';
        END IF;
      END $$`);
    await queryRunner.query(
      `ALTER TABLE "bairros_regionais" ALTER COLUMN "bairro_id" SET NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "bairros_regionais"
      ADD CONSTRAINT "UQ_bairros_regionais_bairro_id" UNIQUE ("bairro_id")`);
    await queryRunner.query(`
      ALTER TABLE "bairros_regionais"
      ADD CONSTRAINT "FK_bairros_regionais_bairro_id"
      FOREIGN KEY ("bairro_id") REFERENCES "bairros"("id")`);

    // --- enderecos.bairro_id: repontar de bairros_regionais(id) para bairros(id) ---
    await queryRunner.query(
      `ALTER TABLE "enderecos" DROP CONSTRAINT "FK_enderecos_bairro"`,
    );
    await queryRunner.query(`
      UPDATE "enderecos" e SET "bairro_id" = br."bairro_id"
      FROM "bairros_regionais" br
      WHERE br."id" = e."bairro_id" AND e."bairro_id" IS NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "enderecos"
      ADD CONSTRAINT "FK_enderecos_bairro" FOREIGN KEY ("bairro_id") REFERENCES "bairros"("id")`);

    // --- remove a coluna de texto obsoleta ---
    await queryRunner.query(
      `ALTER TABLE "bairros_regionais" DROP CONSTRAINT "UQ_bairros_regionais_bairro"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bairros_regionais" DROP COLUMN "bairro"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bairros_regionais" ADD "bairro" text`,
    );
    await queryRunner.query(`
      UPDATE "bairros_regionais" br SET "bairro" = b."nome"
      FROM "bairros" b WHERE b."id" = br."bairro_id"`);
    await queryRunner.query(
      `ALTER TABLE "bairros_regionais" ALTER COLUMN "bairro" SET NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "bairros_regionais"
      ADD CONSTRAINT "UQ_bairros_regionais_bairro" UNIQUE ("bairro")`);

    await queryRunner.query(
      `ALTER TABLE "enderecos" DROP CONSTRAINT "FK_enderecos_bairro"`,
    );
    await queryRunner.query(`
      UPDATE "enderecos" e SET "bairro_id" = br."id"
      FROM "bairros_regionais" br
      WHERE br."bairro_id" = e."bairro_id" AND e."bairro_id" IS NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "enderecos"
      ADD CONSTRAINT "FK_enderecos_bairro" FOREIGN KEY ("bairro_id") REFERENCES "bairros_regionais"("id")`);

    await queryRunner.query(
      `ALTER TABLE "bairros_regionais" DROP CONSTRAINT "FK_bairros_regionais_bairro_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bairros_regionais" DROP CONSTRAINT "UQ_bairros_regionais_bairro_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bairros_regionais" DROP COLUMN "bairro_id"`,
    );

    await queryRunner.query(`DROP TABLE "bairros"`);
  }
}
