import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTipoPaginaToCapturasBrutas1787454816728 implements MigrationInterface {
  name = 'AddTipoPaginaToCapturasBrutas1787454816728';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."capturas_brutas_page_type_enum" AS ENUM('listagem', 'detalhe')`,
    );
    await queryRunner.query(
      `ALTER TABLE "capturas_brutas" ADD "page_type" "public"."capturas_brutas_page_type_enum" NOT NULL DEFAULT 'listagem'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "capturas_brutas" DROP COLUMN "page_type"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."capturas_brutas_page_type_enum"`,
    );
  }
}
