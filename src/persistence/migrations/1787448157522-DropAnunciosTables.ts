import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Descontinua o pipeline estruturado antigo (`anuncios`/`observacoes_preco`)
 * — por ora, não permanente — em favor da captura bruta (`capturas_brutas`).
 * Rodar `src/scripts/backup-anuncios.ts` ANTES desta migration: `up()` apaga
 * os dados, sem volta automática. `down()` recria o schema (mesmas colunas e
 * valores de enum atuais, incluindo a coluna "title" — bug pré-existente
 * nunca corrigido, fora de escopo aqui), mas não repõe os dados: isso exige
 * reimportar o backup manualmente, mesmo padrão de "reversão não
 * automatizável com segurança" já usado em AddQuintoAndarOrigin/
 * AddImovelwebOrigin/AddImoviewClusterOrigins para valores de enum.
 */
export class DropAnunciosTables1787448157522 implements MigrationInterface {
  name = 'DropAnunciosTables1787448157522';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "observacoes_preco"`);
    await queryRunner.query(`DROP TABLE "anuncios"`);
    await queryRunner.query(`DROP TYPE "anuncios_ad_type_enum"`);
    await queryRunner.query(`DROP TYPE "anuncios_transaction_type_enum"`);
    await queryRunner.query(`DROP TYPE "anuncios_origin_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "anuncios_origin_enum" AS ENUM ('olx', 'viva_real', 'zap_imoveis', 'netimoveis', 'quinto_andar', 'imovelweb', 'imobiliaria_buritis', 'liderar_imoveis')`,
    );
    await queryRunner.query(
      `CREATE TYPE "anuncios_transaction_type_enum" AS ENUM ('aluguel', 'venda')`,
    );
    await queryRunner.query(
      `CREATE TYPE "anuncios_ad_type_enum" AS ENUM ('imovel')`,
    );

    await queryRunner.query(`
      CREATE TABLE "anuncios" (
        "id" SERIAL PRIMARY KEY,
        "link" text NOT NULL,
        "title" text NOT NULL,
        "bedrooms" integer NOT NULL DEFAULT 0,
        "bathrooms" integer NOT NULL DEFAULT 0,
        "parking_spots" integer,
        "area" integer NOT NULL DEFAULT 0,
        "location" text NOT NULL,
        "origin" "anuncios_origin_enum" NOT NULL,
        "ad_type" "anuncios_ad_type_enum" NOT NULL DEFAULT 'imovel',
        "transaction_type" "anuncios_transaction_type_enum" NOT NULL,
        "property_type" text,
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
        CONSTRAINT "UQ_anuncios_link" UNIQUE ("link")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "observacoes_preco" (
        "id" SERIAL PRIMARY KEY,
        "anuncio_id" integer NOT NULL,
        "price" integer NOT NULL,
        "iptu" integer NOT NULL DEFAULT 0,
        "condominio" integer NOT NULL DEFAULT 0,
        "total_price" integer NOT NULL,
        "scraped_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_observacoes_preco_anuncio" FOREIGN KEY ("anuncio_id")
          REFERENCES "anuncios"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_observacoes_preco_anuncio_scraped_at" ON "observacoes_preco" ("anuncio_id", "scraped_at")`,
    );
  }
}
