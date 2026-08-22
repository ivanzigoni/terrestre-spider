import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameImoveisToAnuncios1787434498113 implements MigrationInterface {
  name = 'RenameImoveisToAnuncios1787434498113';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "imoveis" RENAME TO "anuncios"`);
    await queryRunner.query(
      `ALTER TABLE "anuncios" RENAME CONSTRAINT "UQ_imoveis_link" TO "UQ_anuncios_link"`,
    );
    await queryRunner.query(
      `ALTER TYPE "imoveis_origin_enum" RENAME TO "anuncios_origin_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "imoveis_transaction_type_enum" RENAME TO "anuncios_transaction_type_enum"`,
    );

    // Categoria do anúncio em si (o que está sendo anunciado), distinta de
    // "property_type" (tipo do imóvel dentro da categoria). Único produtor da tabela
    // hoje é a spider, que só raspa anúncio de imóvel — daí o único valor do enum e o
    // DEFAULT, que cobre tanto o backfill das linhas existentes quanto inserts futuros
    // que porventura não informem a coluna.
    await queryRunner.query(
      `CREATE TYPE "anuncios_ad_type_enum" AS ENUM ('imovel')`,
    );
    await queryRunner.query(
      `ALTER TABLE "anuncios" ADD "ad_type" "anuncios_ad_type_enum" NOT NULL DEFAULT 'imovel'`,
    );

    await queryRunner.query(
      `ALTER TABLE "observacoes_preco" RENAME COLUMN "imovel_id" TO "anuncio_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "observacoes_preco" RENAME CONSTRAINT "FK_observacoes_preco_imovel" TO "FK_observacoes_preco_anuncio"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_observacoes_preco_imovel_scraped_at" RENAME TO "IDX_observacoes_preco_anuncio_scraped_at"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER INDEX "IDX_observacoes_preco_anuncio_scraped_at" RENAME TO "IDX_observacoes_preco_imovel_scraped_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "observacoes_preco" RENAME CONSTRAINT "FK_observacoes_preco_anuncio" TO "FK_observacoes_preco_imovel"`,
    );
    await queryRunner.query(
      `ALTER TABLE "observacoes_preco" RENAME COLUMN "anuncio_id" TO "imovel_id"`,
    );

    await queryRunner.query(`ALTER TABLE "anuncios" DROP COLUMN "ad_type"`);
    await queryRunner.query(`DROP TYPE "anuncios_ad_type_enum"`);

    await queryRunner.query(
      `ALTER TYPE "anuncios_transaction_type_enum" RENAME TO "imoveis_transaction_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "anuncios_origin_enum" RENAME TO "imoveis_origin_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "anuncios" RENAME CONSTRAINT "UQ_anuncios_link" TO "UQ_imoveis_link"`,
    );
    await queryRunner.query(`ALTER TABLE "anuncios" RENAME TO "imoveis"`);
  }
}
