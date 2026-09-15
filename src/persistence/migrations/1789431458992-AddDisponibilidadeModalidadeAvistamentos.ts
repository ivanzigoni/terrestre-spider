import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDisponibilidadeModalidadeAvistamentos1789431458992 implements MigrationInterface {
  name = 'AddDisponibilidadeModalidadeAvistamentos1789431458992';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "avistamentos" ADD "disponivel_aluguel" boolean`,
    );
    await queryRunner.query(
      `ALTER TABLE "avistamentos" ADD "disponivel_venda" boolean`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "avistamentos" DROP COLUMN "disponivel_venda"`,
    );
    await queryRunner.query(
      `ALTER TABLE "avistamentos" DROP COLUMN "disponivel_aluguel"`,
    );
  }
}
