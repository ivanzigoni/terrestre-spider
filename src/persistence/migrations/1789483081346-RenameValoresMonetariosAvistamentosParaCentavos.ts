import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameValoresMonetariosAvistamentosParaCentavos1789483081346 implements MigrationInterface {
  name = 'RenameValoresMonetariosAvistamentosParaCentavos1789483081346';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "avistamentos" RENAME COLUMN "preco_venda" TO "preco_venda_centavos"`,
    );
    await queryRunner.query(
      `ALTER TABLE "avistamentos" RENAME COLUMN "preco_aluguel" TO "preco_aluguel_centavos"`,
    );
    await queryRunner.query(
      `ALTER TABLE "avistamentos" RENAME COLUMN "condominio" TO "condominio_centavos"`,
    );
    await queryRunner.query(
      `ALTER TABLE "avistamentos" RENAME COLUMN "iptu" TO "iptu_centavos"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "avistamentos" RENAME COLUMN "iptu_centavos" TO "iptu"`,
    );
    await queryRunner.query(
      `ALTER TABLE "avistamentos" RENAME COLUMN "condominio_centavos" TO "condominio"`,
    );
    await queryRunner.query(
      `ALTER TABLE "avistamentos" RENAME COLUMN "preco_aluguel_centavos" TO "preco_aluguel"`,
    );
    await queryRunner.query(
      `ALTER TABLE "avistamentos" RENAME COLUMN "preco_venda_centavos" TO "preco_venda"`,
    );
  }
}
