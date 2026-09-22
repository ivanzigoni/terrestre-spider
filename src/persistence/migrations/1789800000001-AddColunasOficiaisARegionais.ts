import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddColunasOficiaisARegionais1789800000001 implements MigrationInterface {
  name = 'AddColunasOficiaisARegionais1789800000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "regionais" ADD "sigla" text`);
    await queryRunner.query(`ALTER TABLE "regionais" ADD "codigo" text`);
    await queryRunner.query(
      `ALTER TABLE "regionais" ADD "area_km2" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "regionais" ADD "perimetro_m" double precision`,
    );
    await queryRunner.query(`ALTER TABLE "regionais" ADD "geometria" text`);
    await queryRunner.query(`
      ALTER TABLE "regionais" ADD CONSTRAINT "UQ_regionais_sigla" UNIQUE ("sigla")`);
    await queryRunner.query(`
      ALTER TABLE "regionais" ADD CONSTRAINT "UQ_regionais_codigo" UNIQUE ("codigo")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "regionais" DROP CONSTRAINT "UQ_regionais_codigo"`,
    );
    await queryRunner.query(
      `ALTER TABLE "regionais" DROP CONSTRAINT "UQ_regionais_sigla"`,
    );
    await queryRunner.query(`ALTER TABLE "regionais" DROP COLUMN "geometria"`);
    await queryRunner.query(
      `ALTER TABLE "regionais" DROP COLUMN "perimetro_m"`,
    );
    await queryRunner.query(`ALTER TABLE "regionais" DROP COLUMN "area_km2"`);
    await queryRunner.query(`ALTER TABLE "regionais" DROP COLUMN "codigo"`);
    await queryRunner.query(`ALTER TABLE "regionais" DROP COLUMN "sigla"`);
  }
}
