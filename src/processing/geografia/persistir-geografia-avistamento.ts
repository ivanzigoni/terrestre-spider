import type { EntityManager } from 'typeorm';

import { AvistamentoEndereco } from '../../persistence/entities/avistamento-endereco.entity.js';
import { Avistamento } from '../../persistence/entities/avistamento.entity.js';
import {
  encontrarOuCriarEnderecoOriginal,
  encontrarOuCriarEnderecoProcessado,
} from './persistir-endereco.js';
import type { CamposEnderecoComuns } from './persistir-endereco.js';

export interface DadosGeograficosAvistamento extends CamposEnderecoComuns {
  bairro: string | null;
}

export interface GeografiaResolvida {
  bairroId: number | null;
  regionalId: number | null;
}

export async function persistirGeografiaDoAvistamento(
  manager: EntityManager,
  avistamentoId: number,
  dados: DadosGeograficosAvistamento,
  bairroId: number | null,
): Promise<void> {
  const { bairro, ...camposEndereco } = dados;
  const avistamentoEnderecoRepo = manager.getRepository(AvistamentoEndereco);

  const enderecoOriginalId = await encontrarOuCriarEnderecoOriginal(manager, {
    ...camposEndereco,
    bairro,
  });
  if (enderecoOriginalId !== null) {
    await avistamentoEnderecoRepo.save(
      avistamentoEnderecoRepo.create({
        avistamentoId,
        enderecoId: enderecoOriginalId,
        tipo: 'original',
      }),
    );
  }

  if (bairroId !== null) {
    const enderecoProcessadoId = await encontrarOuCriarEnderecoProcessado(
      manager,
      bairroId,
      camposEndereco,
    );
    await avistamentoEnderecoRepo.save(
      avistamentoEnderecoRepo.create({
        avistamentoId,
        enderecoId: enderecoProcessadoId,
        tipo: 'processado',
      }),
    );
  }
}

export async function substituirGeografiaDoAvistamento(
  manager: EntityManager,
  avistamentoId: number,
  dados: DadosGeograficosAvistamento,
  geografia: GeografiaResolvida,
): Promise<void> {
  await manager.getRepository(AvistamentoEndereco).delete({ avistamentoId });
  await persistirGeografiaDoAvistamento(
    manager,
    avistamentoId,
    dados,
    geografia.bairroId,
  );
  await manager
    .getRepository(Avistamento)
    .update(avistamentoId, { regionalId: geografia.regionalId });
}
