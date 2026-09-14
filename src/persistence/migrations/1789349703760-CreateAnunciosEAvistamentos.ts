import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnunciosEAvistamentos1789349703760 implements MigrationInterface {
  name = 'CreateAnunciosEAvistamentos1789349703760';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "terrestre"."anuncios_origem_enum" AS ENUM('olx', 'viva_real', 'zap_imoveis', 'netimoveis', 'quinto_andar', 'imovelweb', 'imobiliaria_buritis', 'liderar_imoveis', 'casa_grande_imoveis', 'adimoveis_bh', 'diego_garcia_imoveis', 'valore_imoveis', 'ivi_invista_imoveis', 'real_imobiliaria', 'jmc_imoveis', 'luxus_imoveis_premium', 'casa_pampulha_imoveis', 'habitar_pampulha', 'modelo_imovel', 'primer_imoveis', 'real_imoveis_pampulha', 'seven_imoveis', 'topmig_imoveis', 'venda_nova_imoveis', 'lima_imoveis_barreiro', 'strutural_imobiliaria', 'gsa_ativos', 'imobiliaria_pampulha', 'chave_certa_imoveis_bh', 'casa_mineira', 'stilo_netimoveis', 'my_broker_belo_horizonte')`,
    );
    await queryRunner.query(
      `CREATE TABLE "anuncios" ("id" SERIAL NOT NULL, "origem" "terrestre"."anuncios_origem_enum" NOT NULL, "codigo_externo" text NOT NULL, "primeiro_visto_em" TIMESTAMP WITH TIME ZONE NOT NULL, "ultimo_visto_em" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e38512a0cf3f4f9452fcdc082de" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_2a07a3e1be40a9286157b3e7dd" ON "anuncios" ("origem", "codigo_externo")`,
    );
    await queryRunner.query(
      `CREATE TABLE "avistamentos" ("id" SERIAL NOT NULL, "anuncio_id" integer NOT NULL, "captura_bruta_id" integer NOT NULL, "observado_em" TIMESTAMP WITH TIME ZONE NOT NULL, "url" text NOT NULL, "preco_venda" integer, "preco_aluguel" integer, "condominio" integer, "iptu" integer, "area" double precision, "quartos" smallint, "suites" smallint, "banheiros" smallint, "vagas" smallint, "tipo_imovel_bruto" text, "bairro" text, "cidade" text, "estado" text, "cep" text, "endereco" text, "numero" text, "latitude" double precision, "longitude" double precision, "descricao" text, "anunciante_nome" text, "codigo_creci" text, "publicado_em" TIMESTAMP WITH TIME ZONE, "atualizado_em" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_3a08682469c1020bc06b21e33e4" UNIQUE ("captura_bruta_id"), CONSTRAINT "PK_3db36b8f836d6777cb688ab1bfe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1e1d0d0da46a87591560b96a53" ON "avistamentos" ("anuncio_id")`,
    );
    await queryRunner.query(
      `CREATE TYPE "terrestre"."execucoes_processamento_status_enum" AS ENUM('em_andamento', 'sucesso', 'falha')`,
    );
    await queryRunner.query(
      `CREATE TABLE "execucoes_processamento" ("id" SERIAL NOT NULL, "status" "terrestre"."execucoes_processamento_status_enum" NOT NULL DEFAULT 'em_andamento', "iniciada_em" TIMESTAMP WITH TIME ZONE NOT NULL, "finalizada_em" TIMESTAMP WITH TIME ZONE, "capturas_processadas" integer, "capturas_com_erro" integer, "mensagem_erro" text, CONSTRAINT "PK_cb3c2ad04814403d19ff91fe116" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "capturas_brutas" ADD "erro_processamento" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "avistamentos" ADD CONSTRAINT "FK_1e1d0d0da46a87591560b96a53d" FOREIGN KEY ("anuncio_id") REFERENCES "anuncios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "avistamentos" ADD CONSTRAINT "FK_3a08682469c1020bc06b21e33e4" FOREIGN KEY ("captura_bruta_id") REFERENCES "capturas_brutas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "avistamentos" DROP CONSTRAINT "FK_3a08682469c1020bc06b21e33e4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "avistamentos" DROP CONSTRAINT "FK_1e1d0d0da46a87591560b96a53d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "capturas_brutas" DROP COLUMN "erro_processamento"`,
    );
    await queryRunner.query(`DROP TABLE "execucoes_processamento"`);
    await queryRunner.query(
      `DROP TYPE "terrestre"."execucoes_processamento_status_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "terrestre"."IDX_1e1d0d0da46a87591560b96a53"`,
    );
    await queryRunner.query(`DROP TABLE "avistamentos"`);
    await queryRunner.query(
      `DROP INDEX "terrestre"."IDX_2a07a3e1be40a9286157b3e7dd"`,
    );
    await queryRunner.query(`DROP TABLE "anuncios"`);
    await queryRunner.query(`DROP TYPE "terrestre"."anuncios_origem_enum"`);
  }
}
