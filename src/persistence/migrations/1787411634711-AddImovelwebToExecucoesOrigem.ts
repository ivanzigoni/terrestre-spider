import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImovelwebToExecucoesOrigem1787411634711 implements MigrationInterface {
  name = 'AddImovelwebToExecucoesOrigem1787411634711';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "execucoes_origem_enum" ADD VALUE 'imovelweb'`,
    );
  }

  public down(): Promise<void> {
    // Mesmo caso de AddImovelwebOrigin/AddImoviewClusterOrigins: Postgres não suporta DROP
    // VALUE em tipo enum. Reverter exigiria recriar "execucoes_origem_enum" (tabela
    // temporária, DROP + CREATE, backfill) e só é seguro se nenhuma linha em "execucoes"
    // já usar 'imovelweb' — decisão manual, não automatizável com segurança aqui.
    throw new Error(
      'Reversão de AddImovelwebToExecucoesOrigem não suportada automaticamente: ' +
        'Postgres não permite remover um valor de enum. Reverta manualmente ' +
        'recriando "execucoes_origem_enum" sem \'imovelweb\', após confirmar ' +
        'que nenhuma linha de "execucoes" usa esse valor.',
    );
  }
}
