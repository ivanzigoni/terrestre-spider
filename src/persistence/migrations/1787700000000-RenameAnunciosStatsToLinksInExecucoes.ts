import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameAnunciosStatsToLinksInExecucoes1787700000000 implements MigrationInterface {
  name = 'RenameAnunciosStatsToLinksInExecucoes1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "execucoes" RENAME COLUMN "anuncios_encontrados" TO "links_encontrados"`,
    );
    await queryRunner.query(
      `ALTER TABLE "execucoes" RENAME COLUMN "anuncios_unicos_detalhe" TO "links_unicos_detalhe"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "execucoes" RENAME COLUMN "links_unicos_detalhe" TO "anuncios_unicos_detalhe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "execucoes" RENAME COLUMN "links_encontrados" TO "anuncios_encontrados"`,
    );
  }
}
