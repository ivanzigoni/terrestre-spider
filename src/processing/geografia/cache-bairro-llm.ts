import type { DataSource } from 'typeorm';

import { BairroLlmCache } from '../../persistence/entities/bairro-llm-cache.entity.js';
import type { InferenciaBairroLlm } from './inferir-bairro-llm.port.js';

export interface CacheBairroLlm {
  buscar: (
    valorBrutoNormalizado: string,
  ) => Promise<InferenciaBairroLlm | null>;
  salvar: (
    valorBrutoNormalizado: string,
    resultado: InferenciaBairroLlm,
  ) => Promise<void>;
}

export function criarCacheBairroLlm(dataSource: DataSource): CacheBairroLlm {
  const repo = dataSource.getRepository(BairroLlmCache);

  return {
    async buscar(valorBrutoNormalizado) {
      const linha = await repo.findOne({
        where: { valorBrutoNormalizado },
      });
      if (linha === null) return null;
      return { bairro: linha.bairroInferido, confianca: linha.confianca ?? 0 };
    },

    async salvar(valorBrutoNormalizado, resultado) {
      await dataSource.query(
        `INSERT INTO "bairros_llm_cache" ("valor_bruto_normalizado", "bairro_inferido", "confianca", "resolvido", "created_at")
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT ("valor_bruto_normalizado") DO UPDATE SET
           "bairro_inferido" = EXCLUDED."bairro_inferido",
           "confianca" = EXCLUDED."confianca",
           "resolvido" = EXCLUDED."resolvido"`,
        [
          valorBrutoNormalizado,
          resultado.bairro,
          resultado.confianca,
          resultado.bairro !== null,
        ],
      );
    },
  };
}
