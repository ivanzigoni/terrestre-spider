import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddErroStatusToCapturasBrutas1789349703761 implements MigrationInterface {
  name = 'AddErroStatusToCapturasBrutas1789349703761';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "terrestre"."capturas_brutas_status_enum" ADD VALUE 'erro'`,
    );
  }

  public down(): Promise<void> {
    throw new Error(
      'Reversão de AddErroStatusToCapturasBrutas não suportada automaticamente: ' +
        'Postgres não permite remover um valor de enum. Reverta manualmente ' +
        'recriando "capturas_brutas_status_enum" sem \'erro\', após confirmar ' +
        'que nenhuma linha de "capturas_brutas" usa esse valor.',
    );
  }
}
