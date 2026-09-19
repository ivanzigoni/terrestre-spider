import pLimit from 'p-limit';
import pRetry from 'p-retry';
import { z } from 'zod';

import { requireEnv } from '../../persistence/require-env.js';
import type {
  InferenciaBairroLlm,
  InferidorBairroLlm,
} from './inferir-bairro-llm.port.js';

// Mesmo endpoint e formato de request já usados em
// src/scripts/analisar-qualidade-capturas.ts (fetch puro, sem SDK — ver DEEPSEEK_API_KEY/
// DEEPSEEK_MODEL no .env.example). Esta implementação é uma tarefa de classificação
// diferente (bairro, não qualidade de captura), por isso não reaproveita a função
// privada de lá, mas segue o mesmo padrão de chamada.
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const CONCORRENCIA_MAXIMA = 5;
const TENTATIVAS = 2;
const SENTINELA_NAO_IDENTIFICADO = 'NAO_IDENTIFICADO';

const respostaSchema = z.object({
  bairro: z.string(),
  confianca: z.number().min(0).max(1),
});

function montarSystemPrompt(bairrosValidos: readonly string[]): string {
  return [
    'Você classifica um texto de bairro extraído de um anúncio imobiliário de Belo Horizonte,',
    'associando-o a um dos bairros oficiais listados abaixo.',
    '',
    'Bairros oficiais válidos:',
    bairrosValidos.join(', '),
    '',
    'Se o texto não corresponder com segurança a nenhum bairro da lista (ex.: é de outro',
    `município, é lixo de extração, ou é ambíguo demais), responda "${SENTINELA_NAO_IDENTIFICADO}"`,
    'em vez de chutar um bairro da lista.',
    '',
    'Responda só com um objeto JSON no formato exato:',
    `{"bairro": "<um bairro exato da lista ou "${SENTINELA_NAO_IDENTIFICADO}">", "confianca": <número de 0 a 1>}`,
  ].join('\n');
}

export function criarInferidorBairroDeepseek(
  bairrosValidos: readonly string[],
): InferidorBairroLlm {
  const apiKey = requireEnv('DEEPSEEK_API_KEY');
  const model = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
  const bairrosValidosSet = new Set(bairrosValidos);
  const systemPrompt = montarSystemPrompt(bairrosValidos);
  const limit = pLimit(CONCORRENCIA_MAXIMA);

  return {
    inferir: (valorBruto: string): Promise<InferenciaBairroLlm> =>
      limit(() =>
        pRetry(
          async () => {
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
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: valorBruto },
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
              throw new Error(
                'resposta do DeepSeek sem choices[0].message.content',
              );
            }

            const resposta = respostaSchema.parse(
              JSON.parse(conteudo) as unknown,
            );
            const bairroValido =
              resposta.bairro !== SENTINELA_NAO_IDENTIFICADO &&
              bairrosValidosSet.has(resposta.bairro);

            return {
              bairro: bairroValido ? resposta.bairro : null,
              confianca: bairroValido ? resposta.confianca : 0,
            };
          },
          { retries: TENTATIVAS },
        ),
      ),
  };
}
