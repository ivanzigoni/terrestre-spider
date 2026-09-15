import { z } from 'zod';

import type { TipoTransacao } from '../persistence/enums/tipo-transacao.enum.js';

export const anuncioNormalizadoSchema = z.object({
  codigoExterno: z.string().min(1),
  precoVenda: z.number().int().nonnegative().nullable(),
  precoAluguel: z.number().int().nonnegative().nullable(),
  disponivelAluguel: z.boolean().nullable(),
  disponivelVenda: z.boolean().nullable(),
  condominio: z.number().int().nonnegative().nullable(),
  iptu: z.number().int().nonnegative().nullable(),
  area: z.number().nonnegative().nullable(),
  quartos: z.number().int().nonnegative().nullable(),
  suites: z.number().int().nonnegative().nullable(),
  banheiros: z.number().int().nonnegative().nullable(),
  vagas: z.number().int().nonnegative().nullable(),
  tipoImovelBruto: z.string().nullable(),
  bairro: z.string().nullable(),
  cidade: z.string().nullable(),
  estado: z.string().nullable(),
  cep: z.string().nullable(),
  endereco: z.string().nullable(),
  numero: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  descricao: z.string().nullable(),
  anuncianteNome: z.string().nullable(),
  codigoCreci: z.string().nullable(),
  publicadoEm: z.date().nullable(),
  atualizadoEm: z.date().nullable(),
});

export type AnuncioNormalizado = z.infer<typeof anuncioNormalizadoSchema>;

export interface ContextoCaptura {
  tipoTransacao: TipoTransacao | null;
}

export type Parser = (
  conteudo: string,
  contexto?: ContextoCaptura,
) => AnuncioNormalizado;
