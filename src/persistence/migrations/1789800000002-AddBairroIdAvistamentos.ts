import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBairroIdAvistamentos1789800000002 implements MigrationInterface {
  name = 'AddBairroIdAvistamentos1789800000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "avistamentos" ADD "bairro_id" integer`,
    );
    await queryRunner.query(`
      ALTER TABLE "avistamentos"
      ADD CONSTRAINT "FK_avistamentos_bairro_id" FOREIGN KEY ("bairro_id") REFERENCES "bairros"("id")`);
    await queryRunner.query(`
      CREATE INDEX "IDX_avistamentos_bairro_id" ON "avistamentos" ("bairro_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_avistamentos_bairro_id"`);
    await queryRunner.query(
      `ALTER TABLE "avistamentos" DROP CONSTRAINT "FK_avistamentos_bairro_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "avistamentos" DROP COLUMN "bairro_id"`,
    );
  }
}
