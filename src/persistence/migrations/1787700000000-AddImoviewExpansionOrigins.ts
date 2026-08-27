import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImoviewExpansionOrigins1787700000000 implements MigrationInterface {
  name = 'AddImoviewExpansionOrigins1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Mesmo caso de AddCasaGrandeOrigin: só os dois enums do pipeline atual (execuções e
    // captura bruta) precisam do novo valor — `imoveis_origin_enum` não existe mais.
    const novasOrigens = [
      'adimoveis_bh',
      'diego_garcia_imoveis',
      'valore_imoveis',
      'ivi_invista_imoveis',
      'real_imobiliaria',
    ];
    for (const origem of novasOrigens) {
      await queryRunner.query(
        `ALTER TYPE "execucoes_origem_enum" ADD VALUE '${origem}'`,
      );
      await queryRunner.query(
        `ALTER TYPE "capturas_brutas_origem_enum" ADD VALUE '${origem}'`,
      );
    }
  }

  public down(): Promise<void> {
    // Mesmo caso de AddCasaGrandeOrigin: Postgres não suporta DROP VALUE em tipo enum.
    // Reverter exigiria recriar os dois tipos (tabela temporária, DROP + CREATE, backfill)
    // e só é seguro se nenhuma linha em `execucoes`/`capturas_brutas` já usar algum dos
    // novos valores — decisão manual, não automatizável com segurança aqui.
    throw new Error(
      'Reversão de AddImoviewExpansionOrigins não suportada automaticamente: Postgres ' +
        'não permite remover um valor de enum. Reverta manualmente recriando ' +
        '"execucoes_origem_enum" e "capturas_brutas_origem_enum" sem os novos valores ' +
        '(adimoveis_bh, diego_garcia_imoveis, valore_imoveis, ivi_invista_imoveis, ' +
        'real_imobiliaria), após confirmar que nenhuma linha usa esses valores.',
    );
  }
}
