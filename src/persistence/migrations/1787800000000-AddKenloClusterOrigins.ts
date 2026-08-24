import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKenloClusterOrigins1787800000000 implements MigrationInterface {
  name = 'AddKenloClusterOrigins1787800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Mesmo caso de AddImoviewExpansionOrigins: só os dois enums do pipeline atual
    // (execuções e captura bruta) precisam do novo valor.
    const novasOrigens = ['jmc_imoveis', 'luxus_imoveis_premium'];
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
    // Postgres não suporta DROP VALUE em tipo enum — mesma ressalva de
    // AddImoviewExpansionOrigins.
    throw new Error(
      'Reversão de AddKenloClusterOrigins não suportada automaticamente: Postgres não ' +
        'permite remover um valor de enum. Reverta manualmente recriando ' +
        '"execucoes_origem_enum" e "capturas_brutas_origem_enum" sem os novos valores ' +
        '(jmc_imoveis, luxus_imoveis_premium), após confirmar que nenhuma linha usa ' +
        'esses valores.',
    );
  }
}
