import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLoftSitesClusterOrigins1787900000000 implements MigrationInterface {
  name = 'AddLoftSitesClusterOrigins1787900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Mesmo caso de AddKenloClusterOrigins: só os dois enums do pipeline atual
    // (execuções e captura bruta) precisam do novo valor.
    const novasOrigens = [
      'casa_pampulha_imoveis',
      'habitar_pampulha',
      'modelo_imovel',
      'primer_imoveis',
      'real_imoveis_pampulha',
      'seven_imoveis',
      'topmig_imoveis',
      'venda_nova_imoveis',
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
    // Postgres não suporta DROP VALUE em tipo enum — mesma ressalva de
    // AddKenloClusterOrigins/AddImoviewExpansionOrigins.
    throw new Error(
      'Reversão de AddLoftSitesClusterOrigins não suportada automaticamente: Postgres ' +
        'não permite remover um valor de enum. Reverta manualmente recriando ' +
        '"execucoes_origem_enum" e "capturas_brutas_origem_enum" sem os novos valores ' +
        '(casa_pampulha_imoveis, habitar_pampulha, modelo_imovel, primer_imoveis, ' +
        'real_imoveis_pampulha, seven_imoveis, topmig_imoveis, venda_nova_imoveis), ' +
        'após confirmar que nenhuma linha usa esses valores.',
    );
  }
}
