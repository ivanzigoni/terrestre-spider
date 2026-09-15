import { log } from 'crawlee';
import type { Repository } from 'typeorm';

import { anuncioNormalizadoSchema } from '../processing/anuncio-normalizado.js';
import { getParser } from '../processing/parsers/index.js';
import { createDataSource } from '../persistence/data-source.js';
import { Avistamento } from '../persistence/entities/avistamento.entity.js';
import { downloadObject, getS3Client } from '../persistence/s3-client.js';

/**
 * Uso: node --env-file-if-exists=.env --import tsx src/scripts/backfill-disponibilidade-modalidade.ts
 * Env opcionais: BACKFILL_BATCH_SIZE (default 50), BACKFILL_CONCORRENCIA (default 5),
 * BACKFILL_LIMIT (sem default — processa tudo que casar com o filtro).
 */

function parsePositiveInt(
  name: string,
  defaultValue: number | undefined,
): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} inválido: "${raw}" (esperado inteiro positivo)`);
  }
  return parsed;
}

const BATCH_SIZE = parsePositiveInt('BACKFILL_BATCH_SIZE', 50) ?? 50;
const CONCORRENCIA = parsePositiveInt('BACKFILL_CONCORRENCIA', 5) ?? 5;
const LIMITE_TOTAL = parsePositiveInt('BACKFILL_LIMIT', undefined);

type ResultadoLinha = 'atualizada' | 'erro';

async function buscarLote(
  avistamentoRepo: Repository<Avistamento>,
  ultimoId: number,
): Promise<Avistamento[]> {
  return avistamentoRepo
    .createQueryBuilder('avistamento')
    .innerJoinAndSelect('avistamento.anuncio', 'anuncio')
    .innerJoinAndSelect('avistamento.capturaBruta', 'capturaBruta')
    .where('avistamento.disponivelAluguel IS NULL')
    .andWhere('avistamento.disponivelVenda IS NULL')
    .andWhere('avistamento.id > :ultimoId', { ultimoId })
    .orderBy('avistamento.id', 'ASC')
    .take(BATCH_SIZE)
    .getMany();
}

async function processarLinha(
  avistamentoRepo: Repository<Avistamento>,
  linha: Avistamento,
): Promise<ResultadoLinha> {
  try {
    const s3 = getS3Client();
    const conteudo = await downloadObject(
      s3,
      linha.capturaBruta.bucket,
      linha.capturaBruta.chaveObjeto,
    );
    const parser = getParser(linha.anuncio.origem);
    const bruto = parser(conteudo, {
      tipoTransacao: linha.capturaBruta.tipoTransacao,
    });
    const resultado = anuncioNormalizadoSchema.safeParse(bruto);
    if (!resultado.success) {
      throw new Error(
        `saída do parser não bate com anuncioNormalizadoSchema: ${resultado.error.message}`,
      );
    }

    await avistamentoRepo.update(linha.id, {
      disponivelAluguel: resultado.data.disponivelAluguel,
      disponivelVenda: resultado.data.disponivelVenda,
    });
    return 'atualizada';
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    log.warning(
      `backfill-disponibilidade-modalidade: avistamento #${String(linha.id)} (${linha.anuncio.origem}) falhou: ${mensagem}`,
    );
    return 'erro';
  }
}

interface Contadores {
  atualizadas: number;
  comErro: number;
}

async function processarLote(
  avistamentoRepo: Repository<Avistamento>,
  lote: Avistamento[],
): Promise<Contadores> {
  const contadores: Contadores = { atualizadas: 0, comErro: 0 };

  for (let i = 0; i < lote.length; i += CONCORRENCIA) {
    const sublote = lote.slice(i, i + CONCORRENCIA);
    const resultados = await Promise.all(
      sublote.map((linha) => processarLinha(avistamentoRepo, linha)),
    );
    for (const resultado of resultados) {
      if (resultado === 'atualizada') contadores.atualizadas++;
      else contadores.comErro++;
    }
  }

  return contadores;
}

async function contarPendentes(
  avistamentoRepo: Repository<Avistamento>,
): Promise<number> {
  return avistamentoRepo
    .createQueryBuilder('avistamento')
    .where('avistamento.disponivelAluguel IS NULL')
    .andWhere('avistamento.disponivelVenda IS NULL')
    .getCount();
}

async function main(): Promise<void> {
  const dataSource = createDataSource();
  await dataSource.initialize();

  try {
    const avistamentoRepo = dataSource.getRepository(Avistamento);
    const totalPendente = await contarPendentes(avistamentoRepo);
    const sufixoLimite =
      LIMITE_TOTAL === undefined
        ? ''
        : ` (limitado a ${String(LIMITE_TOTAL)} nesta run)`;
    log.info(
      `backfill-disponibilidade-modalidade: ${String(totalPendente)} avistamento(s) pendente(s)${sufixoLimite}`,
    );

    let ultimoId = 0;
    const total: Contadores = { atualizadas: 0, comErro: 0 };

    for (;;) {
      const processadas = total.atualizadas + total.comErro;
      if (LIMITE_TOTAL !== undefined && processadas >= LIMITE_TOTAL) break;

      const lote = await buscarLote(avistamentoRepo, ultimoId);
      if (lote.length === 0) break;

      const contadoresLote = await processarLote(avistamentoRepo, lote);
      total.atualizadas += contadoresLote.atualizadas;
      total.comErro += contadoresLote.comErro;
      ultimoId = lote[lote.length - 1]?.id ?? ultimoId;

      log.info(
        `backfill-disponibilidade-modalidade: ${String(total.atualizadas)} atualizada(s), ${String(total.comErro)} com erro até agora (último id ${String(ultimoId)})`,
      );
    }

    log.info(
      `backfill-disponibilidade-modalidade: concluído — ${String(total.atualizadas)} atualizada(s), ${String(total.comErro)} com erro`,
    );
  } finally {
    await dataSource.destroy();
  }
}

await main();
