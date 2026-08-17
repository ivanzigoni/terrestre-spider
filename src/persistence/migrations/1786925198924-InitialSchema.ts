import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1786925198924 implements MigrationInterface {
  name = 'InitialSchema1786925198924';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "imoveis_origin_enum" AS ENUM ('olx', 'viva_real', 'zap_imoveis', 'netimoveis')`,
    );

    await queryRunner.query(`
      CREATE TABLE "imoveis" (
        "id" SERIAL PRIMARY KEY,
        "link" text NOT NULL,
        "title" text NOT NULL,
        "bedrooms" integer NOT NULL DEFAULT 0,
        "bathrooms" integer NOT NULL DEFAULT 0,
        "parking_spots" integer,
        "area" integer NOT NULL DEFAULT 0,
        "location" text NOT NULL,
        "origin" "imoveis_origin_enum" NOT NULL,
        "date_posted_text" text,
        "current_price" integer NOT NULL,
        "current_iptu" integer NOT NULL DEFAULT 0,
        "current_condominio" integer NOT NULL DEFAULT 0,
        "current_total_price" integer NOT NULL,
        "old_price" integer,
        "active" boolean NOT NULL DEFAULT true,
        "first_seen_at" timestamptz NOT NULL,
        "last_seen_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_imoveis_link" UNIQUE ("link")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "observacoes_preco" (
        "id" SERIAL PRIMARY KEY,
        "imovel_id" integer NOT NULL,
        "price" integer NOT NULL,
        "iptu" integer NOT NULL DEFAULT 0,
        "condominio" integer NOT NULL DEFAULT 0,
        "total_price" integer NOT NULL,
        "scraped_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_observacoes_preco_imovel" FOREIGN KEY ("imovel_id")
          REFERENCES "imoveis"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_observacoes_preco_imovel_scraped_at" ON "observacoes_preco" ("imovel_id", "scraped_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_observacoes_preco_imovel_scraped_at"`,
    );
    await queryRunner.query(`DROP TABLE "observacoes_preco"`);
    await queryRunner.query(`DROP TABLE "imoveis"`);
    await queryRunner.query(`DROP TYPE "imoveis_origin_enum"`);
  }
}
