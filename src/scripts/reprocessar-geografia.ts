import { log } from 'crawlee';
import pLimit from 'p-limit';
import { In } from 'typeorm';
import type { DataSource } from 'typeorm';

import { createDataSource } from '../persistence/data-source.js';
import { CapturaBruta } from '../persistence/entities/captura-bruta.entity.js';
import { OrigemAnuncio } from '../persistence/enums/origem-anuncio.enum.js';
import { downloadObject, getS3Client } from '../persistence/s3-client.js';
import { anuncioNormalizadoSchema } from '../processing/anuncio-normalizado.js';
import type { CacheBairroLlm } from '../processing/geografia/cache-bairro-llm.js';
import { criarCacheBairroLlm } from '../processing/geografia/cache-bairro-llm.js';
import { criarInferidorBairroDeepseek } from '../processing/geografia/inferidor-bairro-deepseek.js';
import type { InferidorBairroLlm } from '../processing/geografia/inferir-bairro-llm.port.js';
import type { NormalizacaoGeoContext } from '../processing/geografia/normalizar-bairro.js';
import { normalizarBairro } from '../processing/geografia/normalizar-bairro.js';
import { carregarReferenciaBairros } from '../processing/geografia/normalizar-bairro-deterministico.js';
import { substituirGeografiaDoAvistamento } from '../processing/geografia/persistir-geografia-avistamento.js';
import { getParser } from '../processing/parsers/index.js';

const CONCORRENCIA = 5;
const TAMANHO_LOTE_CONSULTA = 500;

const ULTIMO_AVISTAMENTO_POR_ANUNCIO = `
  SELECT DISTINCT ON (anuncio_id) id, anuncio_id, captura_bruta_id
  FROM avistamentos
  ORDER BY anuncio_id, observado_em DESC, id DESC`;

const SELECAO_SEM_BAIRRO_PROCESSADO = `
  WITH ultimo AS (${ULTIMO_AVISTAMENTO_POR_ANUNCIO})
  SELECT u.id AS "avistamentoId", u.captura_bruta_id AS "capturaBrutaId"
  FROM ultimo u
  WHERE NOT EXISTS (
    SELECT 1 FROM avistamento_endereco ap
    WHERE ap.avistamento_id = u.id AND ap.tipo = 'processado'
  )
  ORDER BY u.id`;

const SELECAO_PROCESSADO_FORA_DE_BH = `
  WITH ultimo AS (${ULTIMO_AVISTAMENTO_POR_ANUNCIO})
  SELECT u.id AS "avistamentoId"
  FROM ultimo u
  JOIN avistamento_endereco ao ON ao.avistamento_id = u.id AND ao.tipo = 'original'
  JOIN enderecos orig ON orig.id = ao.endereco_id
  WHERE orig.cidade IS NOT NULL
    AND upper(orig.cidade) NOT IN ('BELO HORIZONTE', 'BH', 'MINAS GERAIS')
    AND EXISTS (
      SELECT 1 FROM avistamento_endereco ap
      WHERE ap.avistamento_id = u.id AND ap.tipo = 'processado'
    )
  ORDER BY u.id`;

interface Opcoes {
  aplicar: boolean;
  origem: OrigemAnuncio | null;
  corrigirOutrosMunicipios: boolean;
}

interface AvistamentoAlvo {
  avistamentoId: number;
  capturaBrutaId: number;
}

type Resultado = 'resolvido' | 'sem_bairro' | 'erro';

interface ContagemOrigem {
  resolvido: number;
  sem_bairro: number;
  erro: number;
}

function ehOrigem(valor: string): valor is OrigemAnuncio {
  return (Object.values(OrigemAnuncio) as string[]).includes(valor);
}

function lerOpcoes(argumentos: readonly string[]): Opcoes {
  const opcoes: Opcoes = {
    aplicar: false,
    origem: null,
    corrigirOutrosMunicipios: false,
  };
  for (const argumento of argumentos) {
    if (argumento === '--aplicar') {
      opcoes.aplicar = true;
    } else if (argumento === '--corrigir-outros-municipios') {
      opcoes.corrigirOutrosMunicipios = true;
    } else if (argumento.startsWith('--origem=')) {
      const valor = argumento.slice('--origem='.length);
      if (!ehOrigem(valor)) {
        throw new Error(`reprocessar-geografia: origem inválida "${valor}"`);
      }
      opcoes.origem = valor;
    } else {
      throw new Error(
        `reprocessar-geografia: argumento desconhecido "${argumento}"`,
      );
    }
  }
  return opcoes;
}

function criarContexto(
  aplicar: boolean,
  referencia: NormalizacaoGeoContext['referencia'],
  cache: CacheBairroLlm,
  valoresParaLlm: Set<string>,
): NormalizacaoGeoContext {
  if (aplicar) {
    return {
      referencia,
      cache,
      inferidor: criarInferidorBairroDeepseek(
        [...referencia.values()].map((r) => r.bairro),
      ),
    };
  }

  const inferidor: InferidorBairroLlm = {
    inferir: (valorBruto) => {
      valoresParaLlm.add(valorBruto);
      return Promise.resolve({ bairro: null, confianca: 0 });
    },
  };
  return {
    referencia,
    cache: { buscar: cache.buscar, salvar: () => Promise.resolve() },
    inferidor,
  };
}

async function reprocessarAvistamento(
  dataSource: DataSource,
  s3: ReturnType<typeof getS3Client>,
  captura: CapturaBruta,
  avistamentoId: number,
  geo: NormalizacaoGeoContext,
  aplicar: boolean,
): Promise<Resultado> {
  try {
    const conteudo = await downloadObject(
      s3,
      captura.bucket,
      captura.chaveObjeto,
    );
    const bruto = getParser(captura.origem)(conteudo, {
      tipoTransacao: captura.tipoTransacao,
    });
    const normalizado = anuncioNormalizadoSchema.parse(bruto);
    const geografia = await normalizarBairro(
      normalizado.bairro,
      geo,
      normalizado.cidade,
    );
    const resolvido = geografia.bairroId !== null;

    if (aplicar && (resolvido || normalizado.bairro !== null)) {
      await dataSource.transaction((manager) =>
        substituirGeografiaDoAvistamento(
          manager,
          avistamentoId,
          {
            endereco: normalizado.endereco,
            numero: normalizado.numero,
            bairro: normalizado.bairro,
            cidade: normalizado.cidade,
            estado: normalizado.estado,
            cep: normalizado.cep,
            latitude: normalizado.latitude,
            longitude: normalizado.longitude,
          },
          geografia,
        ),
      );
    }

    return resolvido ? 'resolvido' : 'sem_bairro';
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    log.warning(
      `reprocessar-geografia: avistamento #${String(avistamentoId)} (${captura.origem}) falhou: ${mensagem}`,
    );
    return 'erro';
  }
}

async function carregarCapturas(
  dataSource: DataSource,
  ids: readonly number[],
): Promise<Map<number, CapturaBruta>> {
  const capturas = new Map<number, CapturaBruta>();
  for (let inicio = 0; inicio < ids.length; inicio += TAMANHO_LOTE_CONSULTA) {
    const lote = ids.slice(inicio, inicio + TAMANHO_LOTE_CONSULTA);
    const encontradas = await dataSource
      .getRepository(CapturaBruta)
      .findBy({ id: In([...lote]) });
    for (const captura of encontradas) capturas.set(captura.id, captura);
  }
  return capturas;
}

async function reprocessarSemBairro(
  dataSource: DataSource,
  opcoes: Opcoes,
): Promise<void> {
  const alvos = await dataSource.query<AvistamentoAlvo[]>(
    SELECAO_SEM_BAIRRO_PROCESSADO,
  );
  const capturas = await carregarCapturas(
    dataSource,
    alvos.map((alvo) => alvo.capturaBrutaId),
  );
  const selecionados = alvos.filter((alvo) => {
    const captura = capturas.get(alvo.capturaBrutaId);
    return (
      captura !== undefined &&
      (opcoes.origem === null || captura.origem === opcoes.origem)
    );
  });

  const referencia = await carregarReferenciaBairros(dataSource);
  const valoresParaLlm = new Set<string>();
  const geo = criarContexto(
    opcoes.aplicar,
    referencia,
    criarCacheBairroLlm(dataSource),
    valoresParaLlm,
  );

  const s3 = getS3Client();
  const limite = pLimit(CONCORRENCIA);
  const porOrigem = new Map<string, ContagemOrigem>();

  await Promise.all(
    selecionados.map((alvo) =>
      limite(async () => {
        const captura = capturas.get(alvo.capturaBrutaId);
        if (captura === undefined) return;
        const resultado = await reprocessarAvistamento(
          dataSource,
          s3,
          captura,
          alvo.avistamentoId,
          geo,
          opcoes.aplicar,
        );
        const contagem = porOrigem.get(captura.origem) ?? {
          resolvido: 0,
          sem_bairro: 0,
          erro: 0,
        };
        contagem[resultado]++;
        porOrigem.set(captura.origem, contagem);
      }),
    ),
  );

  const modo = opcoes.aplicar ? 'APLICADO' : 'DRY-RUN (nada foi gravado)';
  log.info(
    `reprocessar-geografia [${modo}]: ${String(selecionados.length)} avistamento(s) sem bairro processado`,
  );
  const contagensOrdenadas = [...porOrigem.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [origem, contagem] of contagensOrdenadas) {
    log.info(
      `  ${origem}: resolvido=${String(contagem.resolvido)} sem_bairro=${String(contagem.sem_bairro)} erro=${String(contagem.erro)}`,
    );
  }
  if (!opcoes.aplicar) {
    log.info(
      `  valores distintos que dependeriam de inferência via LLM: ${String(valoresParaLlm.size)}`,
    );
  }
}

async function corrigirOutrosMunicipios(
  dataSource: DataSource,
  aplicar: boolean,
): Promise<void> {
  const alvos = await dataSource.query<{ avistamentoId: number }[]>(
    SELECAO_PROCESSADO_FORA_DE_BH,
  );
  const ids = alvos.map((alvo) => alvo.avistamentoId);
  log.info(
    `reprocessar-geografia: ${String(ids.length)} avistamento(s) de outro município com bairro processado de BH`,
  );
  if (!aplicar || ids.length === 0) return;

  await dataSource.transaction(async (manager) => {
    await manager.query(
      `DELETE FROM avistamento_endereco WHERE tipo = 'processado' AND avistamento_id = ANY($1)`,
      [ids],
    );
    await manager.query(
      `UPDATE avistamentos SET regional_id = NULL WHERE id = ANY($1)`,
      [ids],
    );
  });
  log.info('reprocessar-geografia: vínculos processados removidos');
}

async function main(): Promise<void> {
  const opcoes = lerOpcoes(process.argv.slice(2));
  const dataSource = createDataSource();
  await dataSource.initialize();
  try {
    await reprocessarSemBairro(dataSource, opcoes);
    if (opcoes.corrigirOutrosMunicipios) {
      await corrigirOutrosMunicipios(dataSource, opcoes.aplicar);
    }
  } finally {
    await dataSource.destroy();
  }
}

await main();
