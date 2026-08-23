import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEstatisticasToExecucoes1787514270329 implements MigrationInterface {
  name = 'AddEstatisticasToExecucoes1787514270329';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "execucoes" ADD "requests_total" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "execucoes" ADD "crawler_runtime_millis" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "execucoes" ADD "request_total_duration_millis" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "execucoes" ADD "request_avg_finished_duration_millis" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "execucoes" ADD "request_avg_failed_duration_millis" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "execucoes" ADD "retry_histogram" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "execucoes" ADD "anuncios_encontrados" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "execucoes" ADD "anuncios_unicos_detalhe" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "execucoes" ADD "capturas_brutas_enviadas" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "execucoes" DROP COLUMN "capturas_brutas_enviadas"`,
    );
    await queryRunner.query(
      `ALTER TABLE "execucoes" DROP COLUMN "anuncios_unicos_detalhe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "execucoes" DROP COLUMN "anuncios_encontrados"`,
    );
    await queryRunner.query(
      `ALTER TABLE "execucoes" DROP COLUMN "retry_histogram"`,
    );
    await queryRunner.query(
      `ALTER TABLE "execucoes" DROP COLUMN "request_avg_failed_duration_millis"`,
    );
    await queryRunner.query(
      `ALTER TABLE "execucoes" DROP COLUMN "request_avg_finished_duration_millis"`,
    );
    await queryRunner.query(
      `ALTER TABLE "execucoes" DROP COLUMN "request_total_duration_millis"`,
    );
    await queryRunner.query(
      `ALTER TABLE "execucoes" DROP COLUMN "crawler_runtime_millis"`,
    );
    await queryRunner.query(
      `ALTER TABLE "execucoes" DROP COLUMN "requests_total"`,
    );
  }
}
