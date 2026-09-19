import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImagemUrlAvistamentos1789700000002 implements MigrationInterface {
  name = 'AddImagemUrlAvistamentos1789700000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "avistamentos" ADD "imagem_url" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "avistamentos" DROP COLUMN "imagem_url"`,
    );
  }
}
