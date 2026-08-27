import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImobiBrasilClusterOrigins1788000000000 implements MigrationInterface {
  name = 'AddImobiBrasilClusterOrigins1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Mesmo caso de AddLoftSitesClusterOrigins: só os dois enums do pipeline atual
    // (execuções e captura bruta) precisam do novo valor.
    const novasOrigens = ['lima_imoveis_barreiro', 'strutural_imobiliaria'];
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
    // AddLoftSitesClusterOrigins/AddKenloClusterOrigins.
    throw new Error(
      'Reversão de AddImobiBrasilClusterOrigins não suportada automaticamente: Postgres ' +
        'não permite remover um valor de enum. Reverta manualmente recriando ' +
        '"execucoes_origem_enum" e "capturas_brutas_origem_enum" sem os novos valores ' +
        '(lima_imoveis_barreiro, strutural_imobiliaria), após confirmar que nenhuma ' +
        'linha usa esses valores.',
    );
  }
}
