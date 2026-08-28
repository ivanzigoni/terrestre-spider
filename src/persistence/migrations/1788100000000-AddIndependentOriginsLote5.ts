import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndependentOriginsLote51788100000000 implements MigrationInterface {
  name = 'AddIndependentOriginsLote51788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Mesmo caso das migrations anteriores dos lotes 1-4: só os dois enums do pipeline
    // atual (execuções e captura bruta) precisam do novo valor. Três fontes do lote 5
    // (`.claude/__workdir/integracao-lote/lotes.md`), sem arquitetura compartilhada
    // entre elas — GSA Ativos, Imobiliária Pampulha, Chave Certa Imóveis BH.
    const novasOrigens = [
      'gsa_ativos',
      'imobiliaria_pampulha',
      'chave_certa_imoveis_bh',
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
    // Postgres não suporta DROP VALUE em tipo enum — mesma ressalva das migrations
    // anteriores.
    throw new Error(
      'Reversão de AddIndependentOriginsLote5 não suportada automaticamente: Postgres ' +
        'não permite remover um valor de enum. Reverta manualmente recriando ' +
        '"execucoes_origem_enum" e "capturas_brutas_origem_enum" sem os novos valores ' +
        '(gsa_ativos, imobiliaria_pampulha, chave_certa_imoveis_bh), após confirmar que ' +
        'nenhuma linha usa esses valores.',
    );
  }
}
