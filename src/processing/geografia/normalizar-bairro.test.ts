import { describe, expect, it, vi } from 'vitest';

import type { CacheBairroLlm } from './cache-bairro-llm.js';
import type {
  InferenciaBairroLlm,
  InferidorBairroLlm,
} from './inferir-bairro-llm.port.js';
import type { ReferenciaBairro } from './normalizar-bairro-deterministico.js';
import type { NormalizacaoGeoContext } from './normalizar-bairro.js';
import { normalizarBairro } from './normalizar-bairro.js';

const SAVASSI_ID = 1;
const CENTRO_SUL_ID = 10;

const referencia = new Map<string, ReferenciaBairro>([
  [
    'SAVASSI',
    { bairroId: SAVASSI_ID, bairro: 'SAVASSI', regionalId: CENTRO_SUL_ID },
  ],
]);

function criarCacheFake(
  inicial: Map<string, InferenciaBairroLlm> = new Map<
    string,
    InferenciaBairroLlm
  >(),
): CacheBairroLlm & { salvar: ReturnType<typeof vi.fn> } {
  const salvar = vi.fn((chave: string, resultado: InferenciaBairroLlm) => {
    inicial.set(chave, resultado);
    return Promise.resolve();
  });
  return {
    buscar: (chave: string) => Promise.resolve(inicial.get(chave) ?? null),
    salvar,
  };
}

function criarInferidorFake(
  resultado: InferenciaBairroLlm | (() => Promise<InferenciaBairroLlm>),
): InferidorBairroLlm & { inferir: ReturnType<typeof vi.fn> } {
  const inferir = vi.fn(() =>
    typeof resultado === 'function' ? resultado() : Promise.resolve(resultado),
  );
  return { inferir };
}

function criarContexto(
  overrides: Partial<NormalizacaoGeoContext> = {},
): NormalizacaoGeoContext {
  return {
    referencia,
    cache: criarCacheFake(),
    inferidor: criarInferidorFake({ bairro: null, confianca: 0 }),
    ...overrides,
  };
}

describe('normalizarBairro', () => {
  it('retorna tudo nulo para bairro bruto nulo, sem chamar determinístico nem LLM', async () => {
    const inferidor = criarInferidorFake({ bairro: null, confianca: 0 });
    const resultado = await normalizarBairro(
      null,
      criarContexto({ inferidor }),
    );

    expect(resultado).toEqual({ bairroId: null, regionalId: null });
    expect(inferidor.inferir).not.toHaveBeenCalled();
  });

  it('resolve pela camada determinística sem chamar o LLM', async () => {
    const inferidor = criarInferidorFake({ bairro: null, confianca: 0 });
    const resultado = await normalizarBairro(
      'savassi',
      criarContexto({ inferidor }),
    );

    expect(resultado).toEqual({
      bairroId: SAVASSI_ID,
      regionalId: CENTRO_SUL_ID,
    });
    expect(inferidor.inferir).not.toHaveBeenCalled();
  });

  it('cai pro LLM quando a camada determinística não resolve, e cacheia o resultado', async () => {
    const cache = criarCacheFake();
    const inferidor = criarInferidorFake({ bairro: 'SAVASSI', confianca: 0.9 });
    const resultado = await normalizarBairro(
      'Vila da Serra',
      criarContexto({ cache, inferidor }),
    );

    expect(resultado).toEqual({
      bairroId: SAVASSI_ID,
      regionalId: CENTRO_SUL_ID,
    });
    expect(inferidor.inferir).toHaveBeenCalledWith('Vila da Serra');
    expect(cache.salvar).toHaveBeenCalledWith('VILA DA SERRA', {
      bairro: 'SAVASSI',
      confianca: 0.9,
    });
  });

  it('usa o cache já resolvido sem chamar o LLM de novo', async () => {
    const cache = criarCacheFake(
      new Map([['VILA DA SERRA', { bairro: 'SAVASSI', confianca: 0.9 }]]),
    );
    const inferidor = criarInferidorFake({ bairro: null, confianca: 0 });
    const resultado = await normalizarBairro(
      'Vila da Serra',
      criarContexto({ cache, inferidor }),
    );

    expect(resultado).toEqual({
      bairroId: SAVASSI_ID,
      regionalId: CENTRO_SUL_ID,
    });
    expect(inferidor.inferir).not.toHaveBeenCalled();
  });

  it('chama o LLM quando não há cache, cacheia "não identificado" e não trata como resolvido', async () => {
    const cache = criarCacheFake();
    const inferidor = criarInferidorFake({ bairro: null, confianca: 0 });
    const resultado = await normalizarBairro(
      'Vila da Serra',
      criarContexto({ cache, inferidor }),
    );

    expect(resultado).toEqual({ bairroId: null, regionalId: null });
    expect(inferidor.inferir).toHaveBeenCalledOnce();
    expect(cache.salvar).toHaveBeenCalledWith('VILA DA SERRA', {
      bairro: null,
      confianca: 0,
    });
  });

  it('trata confiança abaixo do limiar como não resolvido, mesmo com bairro preenchido', async () => {
    const cache = criarCacheFake();
    const inferidor = criarInferidorFake({ bairro: 'SAVASSI', confianca: 0.3 });
    const resultado = await normalizarBairro(
      'Vila da Serra',
      criarContexto({ cache, inferidor }),
    );

    expect(resultado.bairroId).toBeNull();
    expect(resultado.regionalId).toBeNull();
    expect(cache.salvar).toHaveBeenCalledWith('VILA DA SERRA', {
      bairro: 'SAVASSI',
      confianca: 0.3,
    });
  });

  it('não propaga erro do inferidor — retorna não resolvido', async () => {
    const inferidor: InferidorBairroLlm = {
      inferir: vi.fn(() => Promise.reject(new Error('falha de rede'))),
    };
    const resultado = await normalizarBairro(
      'Vila da Serra',
      criarContexto({ inferidor }),
    );

    expect(resultado).toEqual({ bairroId: null, regionalId: null });
  });
});

describe('normalizarBairro: cidade do anúncio', () => {
  it('não resolve bairro de anúncio de outro município, mesmo com nome igual ao de um bairro de BH', async () => {
    const inferidor = criarInferidorFake({ bairro: null, confianca: 0 });
    const resultado = await normalizarBairro(
      'Savassi',
      criarContexto({ inferidor }),
      'Contagem',
    );

    expect(resultado).toEqual({ bairroId: null, regionalId: null });
    expect(inferidor.inferir).not.toHaveBeenCalled();
  });

  it.each(['Belo Horizonte', 'belo horizonte', 'BH', 'Minas Gerais', null, ''])(
    'resolve normalmente quando a cidade é %j',
    async (cidade) => {
      const resultado = await normalizarBairro(
        'Savassi',
        criarContexto(),
        cidade,
      );

      expect(resultado).toEqual({
        bairroId: SAVASSI_ID,
        regionalId: CENTRO_SUL_ID,
      });
    },
  );
});
