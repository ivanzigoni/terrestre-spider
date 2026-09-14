import type { MigrationInterface, QueryRunner } from 'typeorm';

import { requireEnv } from '../require-env.js';

export class CreateExecucoes1787078339565 implements MigrationInterface {
  name = 'CreateExecucoes1787078339565';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = requireEnv('POSTGRES_SCHEMA');
    await queryRunner.query(
      `CREATE TYPE "${schema}"."execucoes_origem_enum" AS ENUM('olx', 'viva_real', 'zap_imoveis', 'netimoveis', 'quinto_andar')`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."execucoes_status_enum" AS ENUM('em_andamento', 'sucesso', 'falha')`,
    );
    await queryRunner.query(
      `CREATE TABLE "execucoes" ("id" SERIAL NOT NULL, "origem" "${schema}"."execucoes_origem_enum" NOT NULL, "status" "${schema}"."execucoes_status_enum" NOT NULL DEFAULT 'em_andamento', "iniciada_em" TIMESTAMP WITH TIME ZONE NOT NULL, "finalizada_em" TIMESTAMP WITH TIME ZONE, "requests_finalizados" integer, "requests_falhos" integer, "mensagem_erro" text, CONSTRAINT "PK_e38c31bc658ed641de52c19e083" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = requireEnv('POSTGRES_SCHEMA');
    await queryRunner.query(`DROP TABLE "execucoes"`);
    await queryRunner.query(`DROP TYPE "${schema}"."execucoes_status_enum"`);
    await queryRunner.query(`DROP TYPE "${schema}"."execucoes_origem_enum"`);
  }
}
