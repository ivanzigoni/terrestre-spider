import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImoviewClusterOrigins1787363920605 implements MigrationInterface {
  name = 'AddImoviewClusterOrigins1787363920605';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "imoveis_origin_enum" ADD VALUE 'imobiliaria_buritis'`,
    );
    await queryRunner.query(
      `ALTER TYPE "imoveis_origin_enum" ADD VALUE 'liderar_imoveis'`,
    );
    await queryRunner.query(
      `ALTER TYPE "execucoes_origem_enum" ADD VALUE 'imobiliaria_buritis'`,
    );
    await queryRunner.query(
      `ALTER TYPE "execucoes_origem_enum" ADD VALUE 'liderar_imoveis'`,
    );
  }

  public down(): Promise<void> {
    // Mesmo caso de AddQuintoAndarOrigin/AddMercadoLivreOrigin: Postgres não suporta DROP
    // VALUE em tipo enum. Reverter exigiria recriar os dois tipos (tabela temporária,
    // DROP + CREATE, backfill) e só é seguro se nenhuma linha em `imoveis`/`execucoes` já
    // usar algum dos dois valores — decisão manual, não automatizável com segurança aqui.
    throw new Error(
      'Reversão de AddImoviewClusterOrigins não suportada automaticamente: ' +
        'Postgres não permite remover um valor de enum. Reverta manualmente ' +
        'recriando "imoveis_origin_enum" e "execucoes_origem_enum" sem ' +
        "'imobiliaria_buritis'/'liderar_imoveis', após confirmar que nenhuma linha usa " +
        'esses valores.',
    );
  }
}
