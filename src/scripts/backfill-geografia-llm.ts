import { log } from 'crawlee';

import { createDataSource } from '../persistence/data-source.js';
import { criarCacheBairroLlm } from '../processing/geografia/cache-bairro-llm.js';
import { criarInferidorBairroDeepseek } from '../processing/geografia/inferidor-bairro-deepseek.js';
import {
  carregarReferenciaBairros,
  normalizarBairroDeterministico,
  normalizarChave,
} from '../processing/geografia/normalizar-bairro-deterministico.js';

/**
 * Script de backfill único, fora da pipeline de captura — roda sob demanda contra o que
 * já está em `enderecos`. Pega os valores brutos de `bairro` (linhas tipo 'original') que a
 * camada determinística não resolve e que ainda não estão em `bairros_llm_cache`, chama o
 * DeepSeek (via o mesmo inferidor usado em produção, com concorrência já limitada
 * internamente) e grava cada resultado no cache — depois disso, `processing/main.ts`
 * reaproveita o cache em vez de chamar o LLM de novo pra esses mesmos valores.
 *
 * Uso: node --env-file-if-exists=.env --import tsx src/scripts/backfill-geografia-llm.ts
 */

async function buscarBairrosBrutosDistintos(
  dataSource: Awaited<ReturnType<typeof createDataSource>>,
): Promise<string[]> {
  const linhas = await dataSource.query<{ bairro: string }[]>(
    `SELECT DISTINCT bairro FROM enderecos WHERE tipo = 'original' AND bairro IS NOT NULL`,
  );
  return linhas.map((linha) => linha.bairro);
}

async function buscarChavesJaCacheadas(
  dataSource: Awaited<ReturnType<typeof createDataSource>>,
): Promise<Set<string>> {
  const linhas = await dataSource.query<{ valor_bruto_normalizado: string }[]>(
    `SELECT valor_bruto_normalizado FROM bairros_llm_cache`,
  );
  return new Set(linhas.map((linha) => linha.valor_bruto_normalizado));
}

async function main(): Promise<void> {
  const dataSource = createDataSource();
  await dataSource.initialize();

  try {
    const referencia = await carregarReferenciaBairros(dataSource);
    const [brutosDistintos, jaCacheados] = await Promise.all([
      buscarBairrosBrutosDistintos(dataSource),
      buscarChavesJaCacheadas(dataSource),
    ]);

    const pendentes = brutosDistintos.filter((bruto) => {
      if (normalizarBairroDeterministico(bruto, referencia) !== null) {
        return false;
      }
      return !jaCacheados.has(normalizarChave(bruto));
    });

    log.info(
      `backfill-geografia-llm: ${String(brutosDistintos.length)} valor(es) bruto(s) distinto(s), ${String(pendentes.length)} pendente(s) de inferência via LLM`,
    );

    if (pendentes.length === 0) {
      log.info('backfill-geografia-llm: nada pendente, encerrando.');
      return;
    }

    const cache = criarCacheBairroLlm(dataSource);
    const inferidor = criarInferidorBairroDeepseek(
      [...referencia.values()].map((r) => r.bairro),
    );

    let resolvidos = 0;
    let naoIdentificados = 0;
    let comErro = 0;

    await Promise.all(
      pendentes.map(async (bruto) => {
        try {
          const resultado = await inferidor.inferir(bruto);
          await cache.salvar(normalizarChave(bruto), resultado);
          if (resultado.bairro !== null) {
            resolvidos++;
          } else {
            naoIdentificados++;
          }
        } catch (error) {
          const mensagem =
            error instanceof Error ? error.message : String(error);
          log.warning(
            `backfill-geografia-llm: falha ao inferir "${bruto}": ${mensagem}`,
          );
          comErro++;
        }
      }),
    );

    console.log('\n=== Resumo do backfill ===');
    console.log(`Resolvidos: ${String(resolvidos)}`);
    console.log(`Não identificados: ${String(naoIdentificados)}`);
    console.log(
      `Com erro (não cacheados, tentar de novo depois): ${String(comErro)}`,
    );
    console.log(`Total processado: ${String(pendentes.length)}`);
  } finally {
    await dataSource.destroy();
  }
}

await main();
