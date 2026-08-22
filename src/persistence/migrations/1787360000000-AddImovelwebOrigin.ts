import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImovelwebOrigin1787360000000 implements MigrationInterface {
  name = 'AddImovelwebOrigin1787360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "imoveis_origin_enum" ADD VALUE 'imovelweb'`,
    );
  }

  public down(): Promise<void> {
    // Postgres não suporta DROP VALUE em tipo enum. Reverter exigiria recriar o tipo
    // inteiro (tabela temporária, DROP + CREATE, backfill) e só é seguro se nenhuma
    // linha em `imoveis` já usar 'imovelweb' — decisão manual, não automatizável
    // com segurança aqui. Falha alto em vez de reverter de forma silenciosamente errada.
    throw new Error(
      'Reversão de AddImovelwebOrigin não suportada automaticamente: ' +
        'Postgres não permite remover um valor de enum. Reverta manualmente ' +
        'recriando "imoveis_origin_enum" sem \'imovelweb\', após confirmar ' +
        'que nenhuma linha de "imoveis" usa esse valor.',
    );
  }
}
