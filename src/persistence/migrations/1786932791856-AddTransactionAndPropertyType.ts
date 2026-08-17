import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionAndPropertyType1786932791856 implements MigrationInterface {
  name = 'AddTransactionAndPropertyType1786932791856';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "imoveis_transaction_type_enum" AS ENUM ('aluguel', 'venda')`,
    );

    // Backfill: os dados existentes até aqui foram raspados só de buscas de aluguel.
    await queryRunner.query(
      `ALTER TABLE "imoveis" ADD "transaction_type" "imoveis_transaction_type_enum" NOT NULL DEFAULT 'aluguel'`,
    );
    await queryRunner.query(
      `ALTER TABLE "imoveis" ALTER COLUMN "transaction_type" DROP DEFAULT`,
    );

    await queryRunner.query(`ALTER TABLE "imoveis" ADD "property_type" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "imoveis" DROP COLUMN "property_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "imoveis" DROP COLUMN "transaction_type"`,
    );
    await queryRunner.query(`DROP TYPE "imoveis_transaction_type_enum"`);
  }
}
