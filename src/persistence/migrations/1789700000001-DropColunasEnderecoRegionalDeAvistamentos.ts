import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DropColunasEnderecoRegionalDeAvistamentos1789700000001 implements MigrationInterface {
  name = 'DropColunasEnderecoRegionalDeAvistamentos1789700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Reverificação defensiva (mesmo rodando logo depois da migration anterior): garante que
    // nenhum avistamento com dado de endereço/bairro ficou sem link em avistamento_endereco
    // antes de destruir a única cópia desse dado nas colunas antigas.
    await queryRunner.query(`
      DO $$
      DECLARE orfaos int;
      BEGIN
        SELECT count(*) INTO orfaos FROM "avistamentos" a
        WHERE (a."bairro" IS NOT NULL OR a."endereco" IS NOT NULL OR a."numero" IS NOT NULL
               OR a."cidade" IS NOT NULL OR a."estado" IS NOT NULL OR a."cep" IS NOT NULL
               OR a."latitude" IS NOT NULL OR a."longitude" IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1 FROM "avistamento_endereco" ae WHERE ae."avistamento_id" = a.id AND ae."tipo" = 'original'
          );
        IF orfaos > 0 THEN
          RAISE EXCEPTION 'migration abortada: % avistamentos com dado de endereço sem link original em avistamento_endereco', orfaos;
        END IF;

        SELECT count(*) INTO orfaos FROM "avistamentos" a
        WHERE a."regional" IS NOT NULL AND a."regional_id" IS NULL;
        IF orfaos > 0 THEN
          RAISE EXCEPTION 'migration abortada: % avistamentos com regional preenchida sem regional_id', orfaos;
        END IF;
      END $$`);

    await queryRunner.query(`ALTER TABLE "avistamentos" DROP COLUMN "bairro"`);
    await queryRunner.query(
      `ALTER TABLE "avistamentos" DROP COLUMN "bairro_normalizado"`,
    );
    await queryRunner.query(
      `ALTER TABLE "avistamentos" DROP COLUMN "regional"`,
    );
    await queryRunner.query(
      `ALTER TABLE "avistamentos" DROP COLUMN "territorio"`,
    );
    await queryRunner.query(
      `ALTER TABLE "avistamentos" DROP COLUMN "bairro_normalizacao_metodo"`,
    );
    await queryRunner.query(`ALTER TABLE "avistamentos" DROP COLUMN "cidade"`);
    await queryRunner.query(`ALTER TABLE "avistamentos" DROP COLUMN "estado"`);
    await queryRunner.query(`ALTER TABLE "avistamentos" DROP COLUMN "cep"`);
    await queryRunner.query(
      `ALTER TABLE "avistamentos" DROP COLUMN "endereco"`,
    );
    await queryRunner.query(`ALTER TABLE "avistamentos" DROP COLUMN "numero"`);
    await queryRunner.query(
      `ALTER TABLE "avistamentos" DROP COLUMN "latitude"`,
    );
    await queryRunner.query(
      `ALTER TABLE "avistamentos" DROP COLUMN "longitude"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Simétrico, mas NÃO recupera dado perdido: as colunas voltam vazias (NULL). Aceitável só
    // porque esta migration roda no mesmo deploy da anterior, sem uso isolado meses depois —
    // o dado real continua íntegro em enderecos/avistamento_endereco.
    await queryRunner.query(`ALTER TABLE "avistamentos" ADD "bairro" text`);
    await queryRunner.query(
      `ALTER TABLE "avistamentos" ADD "bairro_normalizado" text`,
    );
    await queryRunner.query(`ALTER TABLE "avistamentos" ADD "regional" text`);
    await queryRunner.query(`ALTER TABLE "avistamentos" ADD "territorio" text`);
    await queryRunner.query(
      `ALTER TABLE "avistamentos" ADD "bairro_normalizacao_metodo" text`,
    );
    await queryRunner.query(`ALTER TABLE "avistamentos" ADD "cidade" text`);
    await queryRunner.query(`ALTER TABLE "avistamentos" ADD "estado" text`);
    await queryRunner.query(`ALTER TABLE "avistamentos" ADD "cep" text`);
    await queryRunner.query(`ALTER TABLE "avistamentos" ADD "endereco" text`);
    await queryRunner.query(`ALTER TABLE "avistamentos" ADD "numero" text`);
    await queryRunner.query(
      `ALTER TABLE "avistamentos" ADD "latitude" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "avistamentos" ADD "longitude" double precision`,
    );
  }
}
