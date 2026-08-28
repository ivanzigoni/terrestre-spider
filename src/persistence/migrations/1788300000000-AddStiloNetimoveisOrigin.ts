import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStiloNetimoveisOrigin1788300000000 implements MigrationInterface {
  name = 'AddStiloNetimoveisOrigin1788300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Mesmo caso das migrations anteriores: só os dois enums do pipeline atual
    // (execuções e captura bruta) precisam do novo valor.
    await queryRunner.query(
      `ALTER TYPE "execucoes_origem_enum" ADD VALUE 'stilo_netimoveis'`,
    );
    await queryRunner.query(
      `ALTER TYPE "capturas_brutas_origem_enum" ADD VALUE 'stilo_netimoveis'`,
    );
  }

  public down(): Promise<void> {
    // Postgres não suporta DROP VALUE em tipo enum — mesma ressalva das migrations
    // anteriores.
    throw new Error(
      'Reversão de AddStiloNetimoveisOrigin não suportada automaticamente: Postgres não ' +
        'permite remover um valor de enum. Reverta manualmente recriando ' +
        '"execucoes_origem_enum" e "capturas_brutas_origem_enum" sem o novo valor ' +
        '(stilo_netimoveis), após confirmar que nenhuma linha usa esse valor.',
    );
  }
}
