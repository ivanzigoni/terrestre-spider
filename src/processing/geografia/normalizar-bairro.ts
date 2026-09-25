import * as Sentry from '@sentry/node';
import { log } from 'crawlee';

import type { CacheBairroLlm } from './cache-bairro-llm.js';
import type { InferidorBairroLlm } from './inferir-bairro-llm.port.js';
import type { ReferenciaBairro } from './normalizar-bairro-deterministico.js';
import {
  normalizarBairroDeterministico,
  normalizarChave,
} from './normalizar-bairro-deterministico.js';

const CONFIANCA_MINIMA = 0.6;

export interface NormalizacaoGeoContext {
  referencia: ReadonlyMap<string, ReferenciaBairro>;
  cache: CacheBairroLlm;
  inferidor: InferidorBairroLlm;
}

export interface ResultadoNormalizacaoBairro {
  bairroId: number | null;
  regionalId: number | null;
}

const SEM_RESULTADO: ResultadoNormalizacaoBairro = {
  bairroId: null,
  regionalId: null,
};

function resultadoDeReferencia(
  referenciaBairro: ReferenciaBairro,
): ResultadoNormalizacaoBairro {
  return {
    bairroId: referenciaBairro.bairroId,
    regionalId: referenciaBairro.regionalId,
  };
}

const CIDADES_COMPATIVEIS = new Set(['BELO HORIZONTE', 'BH', 'MINAS GERAIS']);

function cidadeForaDeBeloHorizonte(cidadeBruta: string | null): boolean {
  if (cidadeBruta === null || cidadeBruta.trim() === '') return false;
  return !CIDADES_COMPATIVEIS.has(normalizarChave(cidadeBruta));
}

export async function normalizarBairro(
  bairroBruto: string | null,
  ctx: NormalizacaoGeoContext,
  cidadeBruta: string | null = null,
): Promise<ResultadoNormalizacaoBairro> {
  if (bairroBruto === null || bairroBruto.trim() === '') return SEM_RESULTADO;
  if (cidadeForaDeBeloHorizonte(cidadeBruta)) return SEM_RESULTADO;

  const determinado = normalizarBairroDeterministico(
    bairroBruto,
    ctx.referencia,
  );
  if (determinado !== null) return resultadoDeReferencia(determinado);

  const chaveCache = normalizarChave(bairroBruto);
  const emCache = await ctx.cache.buscar(chaveCache);
  if (emCache !== null) {
    if (emCache.bairro === null || emCache.confianca < CONFIANCA_MINIMA) {
      return SEM_RESULTADO;
    }
    const referenciaBairro = ctx.referencia.get(
      normalizarChave(emCache.bairro),
    );
    return referenciaBairro === undefined
      ? SEM_RESULTADO
      : resultadoDeReferencia(referenciaBairro);
  }

  try {
    const inferido = await ctx.inferidor.inferir(bairroBruto);
    await ctx.cache.salvar(chaveCache, inferido);

    log.info(
      `normalizar-bairro: "${bairroBruto}" -> ${inferido.bairro ?? 'não identificado'} (confiança ${String(inferido.confianca)})`,
    );

    if (inferido.bairro === null || inferido.confianca < CONFIANCA_MINIMA) {
      return SEM_RESULTADO;
    }

    const referenciaBairro = ctx.referencia.get(
      normalizarChave(inferido.bairro),
    );
    return referenciaBairro === undefined
      ? SEM_RESULTADO
      : resultadoDeReferencia(referenciaBairro);
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    log.warning(
      `normalizar-bairro: falha ao inferir via LLM para "${bairroBruto}": ${mensagem}`,
    );
    Sentry.captureException(error, {
      tags: { origem: 'normalizacao-bairro', fase: 'llm' },
    });
    return SEM_RESULTADO;
  }
}
