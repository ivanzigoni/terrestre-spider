import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCapturasBrutas1787442073486 implements MigrationInterface {
  name = 'CreateCapturasBrutas1787442073486';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."capturas_brutas_origem_enum" AS ENUM('olx', 'viva_real', 'zap_imoveis', 'netimoveis', 'quinto_andar', 'imovelweb', 'imobiliaria_buritis', 'liderar_imoveis')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."capturas_brutas_transaction_type_enum" AS ENUM('aluguel', 'venda')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."capturas_brutas_formato_enum" AS ENUM('html', 'json')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."capturas_brutas_status_enum" AS ENUM('pendente', 'processada')`,
    );
    await queryRunner.query(
      `CREATE TABLE "capturas_brutas" ("id" SERIAL NOT NULL, "origem" "public"."capturas_brutas_origem_enum" NOT NULL, "transaction_type" "public"."capturas_brutas_transaction_type_enum", "formato" "public"."capturas_brutas_formato_enum" NOT NULL, "status" "public"."capturas_brutas_status_enum" NOT NULL DEFAULT 'pendente', "url" text NOT NULL, "bucket" text NOT NULL, "object_key" text NOT NULL, "content_hash" text NOT NULL, "size_bytes" integer NOT NULL, "captured_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_capturas_brutas_object_key" UNIQUE ("object_key"), CONSTRAINT "PK_81c85198a969dda8839073df50b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_capturas_brutas_origem_status" ON "capturas_brutas" ("origem", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_capturas_brutas_origem_status"`);
    await queryRunner.query(`DROP TABLE "capturas_brutas"`);
    await queryRunner.query(`DROP TYPE "public"."capturas_brutas_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."capturas_brutas_formato_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."capturas_brutas_transaction_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."capturas_brutas_origem_enum"`);
  }
}
