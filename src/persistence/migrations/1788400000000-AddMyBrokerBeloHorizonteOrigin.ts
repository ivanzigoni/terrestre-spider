import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMyBrokerBeloHorizonteOrigin1788400000000 implements MigrationInterface {
  name = 'AddMyBrokerBeloHorizonteOrigin1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Mesmo caso das migrations anteriores: só os dois enums do pipeline atual
    // (execuções e captura bruta) precisam do novo valor.
    await queryRunner.query(
      `ALTER TYPE "execucoes_origem_enum" ADD VALUE 'my_broker_belo_horizonte'`,
    );
    await queryRunner.query(
      `ALTER TYPE "capturas_brutas_origem_enum" ADD VALUE 'my_broker_belo_horizonte'`,
    );
  }

  public down(): Promise<void> {
    // Postgres não suporta DROP VALUE em tipo enum — mesma ressalva das migrations
    // anteriores.
    throw new Error(
      'Reversão de AddMyBrokerBeloHorizonteOrigin não suportada automaticamente: Postgres ' +
        'não permite remover um valor de enum. Reverta manualmente recriando ' +
        '"execucoes_origem_enum" e "capturas_brutas_origem_enum" sem o novo valor ' +
        '(my_broker_belo_horizonte), após confirmar que nenhuma linha usa esse valor.',
    );
  }
}
