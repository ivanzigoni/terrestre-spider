import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExecucoes1787078339565 implements MigrationInterface {
  name = 'CreateExecucoes1787078339565';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."execucoes_origem_enum" AS ENUM('olx', 'viva_real', 'zap_imoveis', 'netimoveis', 'quinto_andar')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."execucoes_status_enum" AS ENUM('em_andamento', 'sucesso', 'falha')`,
    );
    await queryRunner.query(
      `CREATE TABLE "execucoes" ("id" SERIAL NOT NULL, "origem" "public"."execucoes_origem_enum" NOT NULL, "status" "public"."execucoes_status_enum" NOT NULL DEFAULT 'em_andamento', "iniciada_em" TIMESTAMP WITH TIME ZONE NOT NULL, "finalizada_em" TIMESTAMP WITH TIME ZONE, "requests_finalizados" integer, "requests_falhos" integer, "mensagem_erro" text, CONSTRAINT "PK_e38c31bc658ed641de52c19e083" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "execucoes"`);
    await queryRunner.query(`DROP TYPE "public"."execucoes_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."execucoes_origem_enum"`);
  }
}
