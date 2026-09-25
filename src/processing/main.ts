import * as Sentry from '@sentry/node';
import { log } from 'crawlee';
import type { DataSource } from 'typeorm';

import { createDataSource } from '../persistence/data-source.js';
import { Anuncio } from '../persistence/entities/anuncio.entity.js';
import { Avistamento } from '../persistence/entities/avistamento.entity.js';
import { CapturaBruta } from '../persistence/entities/captura-bruta.entity.js';
import { ExecucaoProcessamento } from '../persistence/entities/execucao-processamento.entity.js';
import { StatusCapturaBruta } from '../persistence/enums/status-captura-bruta.enum.js';
import { StatusExecucao } from '../persistence/enums/status-execucao.enum.js';
import { TipoPaginaCaptura } from '../persistence/enums/tipo-pagina-captura.enum.js';
import { downloadObject, getS3Client } from '../persistence/s3-client.js';
import { anuncioNormalizadoSchema } from './anuncio-normalizado.js';
import { criarCacheBairroLlm } from './geografia/cache-bairro-llm.js';
import { criarInferidorBairroDeepseek } from './geografia/inferidor-bairro-deepseek.js';
import type { NormalizacaoGeoContext } from './geografia/normalizar-bairro.js';
import { normalizarBairro } from './geografia/normalizar-bairro.js';
import { carregarReferenciaBairros } from './geografia/normalizar-bairro-deterministico.js';
import { persistirGeografiaDoAvistamento } from './geografia/persistir-geografia-avistamento.js';
import { getParser } from './parsers/index.js';

Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });

const BATCH_SIZE = 300;

async function processarCaptura(
  dataSource: DataSource,
  s3: ReturnType<typeof getS3Client>,
  captura: CapturaBruta,
  geo: NormalizacaoGeoContext,
): Promise<'processada' | 'erro'> {
  try {
    const parser = getParser(captura.origem);
    const conteudo = await downloadObject(
      s3,
      captura.bucket,
      captura.chaveObjeto,
    );
    const bruto = parser(conteudo, { tipoTransacao: captura.tipoTransacao });
    const normalizado = anuncioNormalizadoSchema.parse(bruto);
    // Chamada de rede (pode envolver LLM) fica fora da transação de propósito —
    // uma transação de banco não deve ficar aberta esperando I/O externo.
    // normalizarBairro nunca lança: erro na inferência vira resultado "não resolvido".
    const bairroGeo = await normalizarBairro(
      normalizado.bairro,
      geo,
      normalizado.cidade,
    );

    await dataSource.transaction(async (manager) => {
      const anuncioRepo = manager.getRepository(Anuncio);
      let existente = await anuncioRepo.findOne({
        where: {
          origem: captura.origem,
          codigoExterno: normalizado.codigoExterno,
        },
      });

      if (existente === null) {
        existente = anuncioRepo.create({
          origem: captura.origem,
          codigoExterno: normalizado.codigoExterno,
          primeiroVistoEm: captura.capturadoEm,
          ultimoVistoEm: captura.capturadoEm,
        });
      } else {
        if (captura.capturadoEm < existente.primeiroVistoEm) {
          existente.primeiroVistoEm = captura.capturadoEm;
        }
        if (captura.capturadoEm > existente.ultimoVistoEm) {
          existente.ultimoVistoEm = captura.capturadoEm;
        }
      }
      const anuncio = await anuncioRepo.save(existente);

      const {
        precoVenda,
        precoAluguel,
        condominio,
        iptu,
        endereco,
        numero,
        bairro,
        cidade,
        estado,
        cep,
        latitude,
        longitude,
        ...restoNormalizado
      } = normalizado;

      const avistamentoSalvo = await manager.getRepository(Avistamento).save(
        manager.getRepository(Avistamento).create({
          ...restoNormalizado,
          precoVendaCentavos: precoVenda,
          precoAluguelCentavos: precoAluguel,
          condominioCentavos: condominio,
          iptuCentavos: iptu,
          regionalId: bairroGeo.regionalId,
          anuncioId: anuncio.id,
          capturaBrutaId: captura.id,
          observadoEm: captura.capturadoEm,
          url: captura.url,
        }),
      );

      await persistirGeografiaDoAvistamento(
        manager,
        avistamentoSalvo.id,
        { endereco, numero, bairro, cidade, estado, cep, latitude, longitude },
        bairroGeo.bairroId,
      );

      await manager.getRepository(CapturaBruta).update(captura.id, {
        status: StatusCapturaBruta.PROCESSADA,
        erroProcessamento: null,
      });
    });

    return 'processada';
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    log.warning(
      `processamento: captura #${String(captura.id)} (${captura.origem}) falhou: ${mensagem}`,
    );
    Sentry.captureException(error, {
      tags: { origem: captura.origem, fase: 'processamento' },
    });
    await dataSource.getRepository(CapturaBruta).update(captura.id, {
      status: StatusCapturaBruta.ERRO,
      erroProcessamento: mensagem.slice(0, 2000),
    });
    return 'erro';
  }
}

async function main(): Promise<void> {
  const dataSource = createDataSource();
  await dataSource.initialize();

  const execucaoRepo = dataSource.getRepository(ExecucaoProcessamento);
  const execucao = await execucaoRepo.save(
    execucaoRepo.create({ iniciadaEm: new Date() }),
  );

  let processadas = 0;
  let comErro = 0;

  try {
    const s3 = getS3Client();

    // Montado uma vez por execução do processo, não por captura: a referência de
    // bairros é pequena e estável, e o inferidor mantém seu próprio limitador de
    // concorrência entre chamadas.
    const referencia = await carregarReferenciaBairros(dataSource);
    const geo: NormalizacaoGeoContext = {
      referencia,
      cache: criarCacheBairroLlm(dataSource),
      inferidor: criarInferidorBairroDeepseek(
        [...referencia.values()].map((r) => r.bairro),
      ),
    };

    for (;;) {
      const lote = await dataSource.getRepository(CapturaBruta).find({
        where: {
          status: StatusCapturaBruta.PENDENTE,
          tipoPagina: TipoPaginaCaptura.DETALHE,
        },
        take: BATCH_SIZE,
      });
      if (lote.length === 0) break;

      const resultados = await Promise.allSettled(
        lote.map((captura) => processarCaptura(dataSource, s3, captura, geo)),
      );
      for (const resultado of resultados) {
        if (
          resultado.status === 'fulfilled' &&
          resultado.value === 'processada'
        ) {
          processadas++;
        } else {
          comErro++;
        }
      }

      log.info(
        `processamento: ${String(processadas)} processada(s), ${String(comErro)} com erro até agora`,
      );
    }

    await execucaoRepo.update(execucao.id, {
      status: StatusExecucao.SUCESSO,
      finalizadaEm: new Date(),
      capturasProcessadas: processadas,
      capturasComErro: comErro,
    });
  } catch (error) {
    await execucaoRepo.update(execucao.id, {
      status: StatusExecucao.FALHA,
      finalizadaEm: new Date(),
      mensagemErro: error instanceof Error ? error.message : String(error),
      capturasProcessadas: processadas,
      capturasComErro: comErro,
    });
    throw error;
  } finally {
    await dataSource.destroy();
  }

  log.info(
    `processamento: concluído — ${String(processadas)} processada(s), ${String(comErro)} com erro`,
  );

  await Sentry.close(2000);
}

await main();
