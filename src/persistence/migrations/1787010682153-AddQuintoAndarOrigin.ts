import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuintoAndarOrigin1787010682153 implements MigrationInterface {
  name = 'AddQuintoAndarOrigin1787010682153';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "imoveis_origin_enum" ADD VALUE 'quinto_andar'`,
    );
  }

  public down(): Promise<void> {
    // Postgres não suporta DROP VALUE em tipo enum. Reverter exigiria recriar o tipo
    // inteiro (tabela temporária, DROP + CREATE, backfill) e só é seguro se nenhuma
    // linha em `imoveis` já usar 'quinto_andar' — decisão manual, não automatizável
    // com segurança aqui. Falha alto em vez de reverter de forma silenciosamente errada.
    throw new Error(
      'Reversão de AddQuintoAndarOrigin não suportada automaticamente: ' +
        'Postgres não permite remover um valor de enum. Reverta manualmente ' +
        'recriando "imoveis_origin_enum" sem \'quinto_andar\', após confirmar ' +
        'que nenhuma linha de "imoveis" usa esse valor.',
    );
  }
}
