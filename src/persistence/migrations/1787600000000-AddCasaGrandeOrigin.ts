import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCasaGrandeOrigin1787600000000 implements MigrationInterface {
  name = 'AddCasaGrandeOrigin1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Diferente de AddImoviewClusterOrigins (que também alterava o enum de origem da
    // extinta tabela `anuncios`): esse tipo (renomeado para `anuncios_origin_enum` e
    // depois removido por completo, junto com `anuncios`/`observacoes_preco`, em
    // DropAnunciosTables1787448157522) não existe mais no banco. Só os dois enums do
    // pipeline atual (execuções e captura bruta) precisam do novo valor.
    await queryRunner.query(
      `ALTER TYPE "execucoes_origem_enum" ADD VALUE 'casa_grande_imoveis'`,
    );
    await queryRunner.query(
      `ALTER TYPE "capturas_brutas_origem_enum" ADD VALUE 'casa_grande_imoveis'`,
    );
  }

  public down(): Promise<void> {
    // Mesmo caso de AddImoviewClusterOrigins: Postgres não suporta DROP VALUE em tipo
    // enum. Reverter exigiria recriar os dois tipos (tabela temporária, DROP + CREATE,
    // backfill) e só é seguro se nenhuma linha em `execucoes`/`capturas_brutas` já usar
    // o valor — decisão manual, não automatizável com segurança aqui.
    throw new Error(
      'Reversão de AddCasaGrandeOrigin não suportada automaticamente: Postgres não ' +
        'permite remover um valor de enum. Reverta manualmente recriando ' +
        '"execucoes_origem_enum" e "capturas_brutas_origem_enum" sem ' +
        "'casa_grande_imoveis', após confirmar que nenhuma linha usa esse valor.",
    );
  }
}
