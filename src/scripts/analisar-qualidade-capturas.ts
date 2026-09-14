import { mkdir, writeFile } from 'node:fs/promises';

import { load } from 'cheerio';
import { log } from 'crawlee';

import { createDataSource } from '../persistence/data-source.js';
import { downloadObject, getS3Client } from '../persistence/s3-client.js';

/**
 * Script de diagnóstico, não parte da pipeline de captura — roda sob demanda, fora de
 * qualquer `Execucao`, contra o que já está em `capturas_brutas`/no bucket. Usa um LLM
 * (DeepSeek) pra ler uma amostra de páginas brutas e classificar cada uma como
 * conteúdo válido, bloqueio/anti-bot, captcha, página vazia ou erro — um jeito rápido
 * de auditar as 32 fontes sem inspecionar HTML/JSON manualmente um por um.
 *
 * Uso: node --env-file-if-exists=.env --import tsx src/scripts/analisar-qualidade-capturas.ts
 */

interface CapturaAmostra {
  id: number;
  origem: string;
  tipoPagina: 'listagem' | 'detalhe';
  formato: 'html' | 'json';
  url: string;
  bucket: string;
  chaveObjeto: string;
  tamanhoBytes: number;
}

type Classificacao =
  | 'valida'
  | 'bloqueada_antibot'
  | 'captcha'
  | 'vazia'
  | 'erro_pagina'
  | 'outro';

interface ResultadoAnalise {
  classificacao: Classificacao;
  confianca: number;
  motivo: string;
}

interface LinhaRelatorio extends CapturaAmostra {
  resultado: ResultadoAnalise | null;
  erro: string | null;
}

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const CLASSIFICACOES_VALIDAS = new Set<Classificacao>([
  'valida',
  'bloqueada_antibot',
  'captcha',
  'vazia',
  'erro_pagina',
  'outro',
]);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

function parsePositiveInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} inválido: "${raw}" (esperado inteiro positivo)`);
  }
  return parsed;
}

// Amostra "substancial" por fonte, não só 2-3 — ainda bem abaixo do custo/tempo de
// rodar contra as 1649 capturas da última run.
const AMOSTRA_POR_ORIGEM = parsePositiveInt('ANALISE_AMOSTRA_POR_ORIGEM', 15);
const CONCORRENCIA = parsePositiveInt('ANALISE_CONCORRENCIA', 4);
// ~8000 caracteres de texto já limpo (sem script/style) é suficiente pra qualquer um
// dos sinais que procuramos (captcha, bloqueio, página vazia) — eles aparecem logo no
// início do documento, nunca enterrados depois de centenas de cards de listagem.
const MAX_CHARS_CONTEUDO = parsePositiveInt('ANALISE_MAX_CHARS', 8000);

const SYSTEM_PROMPT = `Você audita capturas brutas de um scraper imobiliário. Recebe a URL e um trecho do conteúdo (HTML já sem script/style, ou JSON) de uma página capturada e classifica a captura em exatamente uma categoria:
- "valida": conteúdo real de imóvel(is) — listagem com cards ou página de detalhe com dados do anúncio.
- "bloqueada_antibot": página de desafio/bloqueio (Cloudflare, "acesso negado", rate limit, etc.), sem conteúdo de imóvel.
- "captcha": página pedindo explicitamente para resolver um captcha.
- "vazia": página carregou mas sem nenhum conteúdo de imóvel (busca sem resultados, esqueleto vazio).
- "erro_pagina": erro HTTP/aplicação (404, 500, stack trace, "algo deu errado").
- "outro": não se encaixa em nenhuma acima.

Responda só com um JSON no formato exato: {"classificacao": "<uma das categorias acima>", "confianca": <número de 0 a 1>, "motivo": "<uma frase curta em português explicando por quê>"}.`;

function extrairTextoLegivel(
  conteudo: string,
  formato: 'html' | 'json',
): string {
  if (formato === 'json') {
    return conteudo.slice(0, MAX_CHARS_CONTEUDO);
  }
  const $ = load(conteudo);
  $('script, style, noscript, svg').remove();
  const texto = $('body').text().replace(/\s+/g, ' ').trim();
  return texto.slice(0, MAX_CHARS_CONTEUDO);
}

function isRegistroClassificacao(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseRespostaModelo(conteudo: string): ResultadoAnalise {
  const parsed: unknown = JSON.parse(conteudo);
  if (!isRegistroClassificacao(parsed)) {
    throw new Error('resposta do modelo não é um objeto JSON');
  }
  const { classificacao, confianca, motivo } = parsed;
  if (
    typeof classificacao !== 'string' ||
    !CLASSIFICACOES_VALIDAS.has(classificacao as Classificacao)
  ) {
    throw new Error(
      `classificação inesperada: ${JSON.stringify(classificacao)}`,
    );
  }
  return {
    classificacao: classificacao as Classificacao,
    confianca: typeof confianca === 'number' ? confianca : 0,
    motivo: typeof motivo === 'string' ? motivo : '',
  };
}

async function classificarComDeepSeek(
  apiKey: string,
  model: string,
  captura: CapturaAmostra,
  textoLegivel: string,
): Promise<ResultadoAnalise> {
  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `URL: ${captura.url}\nFormato: ${captura.formato}\nTipo de página: ${captura.tipoPagina}\n\nConteúdo (truncado):\n${textoLegivel}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const corpo = await response.text();
    throw new Error(
      `DeepSeek respondeu ${String(response.status)}: ${corpo.slice(0, 500)}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const conteudo = payload.choices?.[0]?.message?.content;
  if (conteudo === undefined) {
    throw new Error('resposta do DeepSeek sem choices[0].message.content');
  }
  return parseRespostaModelo(conteudo);
}

async function buscarAmostra(): Promise<CapturaAmostra[]> {
  const dataSource = createDataSource();
  await dataSource.initialize();
  try {
    const linhas = await dataSource.query<CapturaAmostra[]>(
      `
      SELECT id, origem, "tipoPagina", formato, url, bucket, "chaveObjeto", "tamanhoBytes"
      FROM (
        SELECT
          id,
          origem,
          page_type AS "tipoPagina",
          formato,
          url,
          bucket,
          object_key AS "chaveObjeto",
          size_bytes AS "tamanhoBytes",
          ROW_NUMBER() OVER (
            PARTITION BY origem
            ORDER BY (page_type = 'detalhe') DESC, random()
          ) AS rn
        FROM capturas_brutas
      ) amostrado
      WHERE rn <= $1
      ORDER BY origem, rn
      `,
      [AMOSTRA_POR_ORIGEM],
    );
    return linhas;
  } finally {
    await dataSource.destroy();
  }
}

async function analisarCaptura(
  apiKey: string,
  model: string,
  captura: CapturaAmostra,
): Promise<LinhaRelatorio> {
  const s3 = getS3Client();
  try {
    const conteudo = await downloadObject(
      s3,
      captura.bucket,
      captura.chaveObjeto,
    );
    const textoLegivel = extrairTextoLegivel(conteudo, captura.formato);
    const resultado = await classificarComDeepSeek(
      apiKey,
      model,
      captura,
      textoLegivel,
    );
    return { ...captura, resultado, erro: null };
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    log.warning(
      `analisar-qualidade-capturas: falha na captura #${String(captura.id)} (${captura.origem}): ${mensagem}`,
    );
    return { ...captura, resultado: null, erro: mensagem };
  }
}

function imprimirResumo(linhas: LinhaRelatorio[]): void {
  const porOrigem = new Map<string, LinhaRelatorio[]>();
  for (const linha of linhas) {
    const grupo = porOrigem.get(linha.origem) ?? [];
    grupo.push(linha);
    porOrigem.set(linha.origem, grupo);
  }

  console.log('\n=== Resumo por origem ===');
  for (const [origem, grupo] of [...porOrigem].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const contagem = new Map<string, number>();
    for (const linha of grupo) {
      const chave = linha.resultado?.classificacao ?? 'erro_analise';
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    }
    const partes = [...contagem]
      .sort(([, a], [, b]) => b - a)
      .map(([classificacao, n]) => `${classificacao}=${String(n)}`)
      .join(', ');
    console.log(`${origem}: ${partes}`);
  }

  console.log('\n=== Resumo geral ===');
  const contagemGeral = new Map<string, number>();
  for (const linha of linhas) {
    const chave = linha.resultado?.classificacao ?? 'erro_analise';
    contagemGeral.set(chave, (contagemGeral.get(chave) ?? 0) + 1);
  }
  for (const [classificacao, n] of [...contagemGeral].sort(
    ([, a], [, b]) => b - a,
  )) {
    console.log(`${classificacao}: ${String(n)} / ${String(linhas.length)}`);
  }
}

async function main(): Promise<void> {
  const apiKey = requireEnv('DEEPSEEK_API_KEY');
  const model = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';

  const amostra = await buscarAmostra();
  log.info(
    `analisar-qualidade-capturas: ${String(amostra.length)} captura(s) selecionada(s) (até ${String(AMOSTRA_POR_ORIGEM)} por origem), modelo ${model}`,
  );

  const resultados: LinhaRelatorio[] = [];
  for (let i = 0; i < amostra.length; i += CONCORRENCIA) {
    const lote = amostra.slice(i, i + CONCORRENCIA);
    const linhas = await Promise.all(
      lote.map((captura) => analisarCaptura(apiKey, model, captura)),
    );
    resultados.push(...linhas);
    log.info(
      `analisar-qualidade-capturas: ${String(resultados.length)}/${String(amostra.length)} analisadas`,
    );
  }

  imprimirResumo(resultados);

  await mkdir('analysis-output', { recursive: true });
  const caminho = `analysis-output/qualidade-capturas-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await writeFile(caminho, JSON.stringify(resultados, null, 2), 'utf-8');
  console.log(`\nRelatório completo salvo em ${caminho}`);
}

await main();
