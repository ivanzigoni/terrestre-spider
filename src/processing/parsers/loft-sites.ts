import { load } from 'cheerio';
import { z } from 'zod';

import type { AnuncioNormalizado, Parser } from '../anuncio-normalizado.js';
import { parseMoneyToCents } from './shared/money.js';
import { extractRscObject } from './shared/rsc-next.js';

const vistaCorretorSchema = z
  .object({
    Nome: z.string().optional(),
    CRECI: z.string().optional(),
  })
  .loose();

const vistaPropertySchema = z
  .object({
    Codigo: z.string().min(1),
    Categoria: z.string().optional(),
    // A API Vista devolve estes campos como `number` em parte das respostas (ex.:
    // "Dormitorios":2, "Latitude":-19.8259461) e como `string` em outras (fixtures
    // originais do cluster). z.coerce.string() aceita as duas formas: um number vira
    // String(number); uma string que já é string passa sem alteração.
    Dormitorios: z.coerce.string().optional(),
    Suites: z.coerce.string().optional(),
    TotalBanheiros: z.coerce.string().optional(),
    Vagas: z.coerce.string().optional(),
    AreaTotal: z.coerce.string().optional(),
    AreaPrivativa: z.coerce.string().optional(),
    ValorVenda: z.coerce.string().optional(),
    ValorLocacao: z.coerce.string().optional(),
    ValorIptu: z.string().optional(),
    ValorCondominio: z.string().optional(),
    Endereco: z.string().optional(),
    Numero: z.string().optional(),
    Bairro: z.string().optional(),
    Cidade: z.string().optional(),
    UF: z.string().optional(),
    Status: z.string().optional(),
    Latitude: z.coerce.string().optional(),
    Longitude: z.coerce.string().optional(),
    DescricaoWeb: z.string().optional(),
    Corretor: z.array(vistaCorretorSchema).optional(),
  })
  .loose();

type VistaProperty = z.infer<typeof vistaPropertySchema>;

const RSC_STREAM_REFERENCE = /^\$[0-9a-zA-Z]{1,8}$/;

function extractVistaProperty(html: string): VistaProperty {
  const raw = extractRscObject(html, 'property');
  return vistaPropertySchema.parse(raw);
}

function parseIntegerField(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function parseDecimalField(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveArea(property: VistaProperty): number | null {
  const privativa = parseDecimalField(property.AreaPrivativa);
  if (privativa !== null && privativa > 0) return privativa;
  return parseDecimalField(property.AreaTotal);
}

function isZeroOrEmptyMoneyString(value: string | undefined): boolean {
  if (value === undefined) return true;
  const trimmed = value.trim();
  if (trimmed === '') return true;
  const normalized = Number(trimmed.replace(',', '.'));
  return Number.isFinite(normalized) && normalized === 0;
}

function resolveMoneyOrNull(value: string | undefined): number | null {
  return isZeroOrEmptyMoneyString(value) ? null : parseMoneyToCents(value);
}

function resolveDisponibilidade(
  status: string | undefined,
  statusDestaModalidade: string,
  statusDaOutraModalidade: string,
  precoDestaModalidade: number | null,
): boolean {
  if (status === statusDaOutraModalidade) return false;
  if (status === statusDestaModalidade) return true;
  return precoDestaModalidade !== null;
}

function resolvePrecos(property: VistaProperty): {
  precoVenda: number | null;
  precoAluguel: number | null;
  disponivelAluguel: boolean;
  disponivelVenda: boolean;
} {
  const valorVenda = resolveMoneyOrNull(property.ValorVenda);
  const valorLocacao = resolveMoneyOrNull(property.ValorLocacao);
  const status = property.Status?.trim().toLowerCase();

  const precoVenda = status === 'aluguel' ? null : valorVenda;
  const precoAluguel = status === 'venda' ? null : valorLocacao;

  return {
    precoVenda,
    precoAluguel,
    disponivelAluguel: resolveDisponibilidade(
      status,
      'aluguel',
      'venda',
      precoAluguel,
    ),
    disponivelVenda: resolveDisponibilidade(
      status,
      'venda',
      'aluguel',
      precoVenda,
    ),
  };
}

function resolveDescricao(descricaoWeb: string | undefined): string | null {
  if (descricaoWeb === undefined) return null;
  const trimmed = descricaoWeb.trim();
  if (trimmed === '') return null;
  if (RSC_STREAM_REFERENCE.test(trimmed)) return null;
  return trimmed;
}

function resolveCorretor(corretor: VistaProperty['Corretor']): {
  anuncianteNome: string | null;
  codigoCreci: string | null;
} {
  const primeiro = corretor?.[0];
  if (primeiro?.Nome === undefined || primeiro.Nome.trim() === '') {
    return { anuncianteNome: null, codigoCreci: null };
  }
  return {
    anuncianteNome: primeiro.Nome,
    codigoCreci:
      primeiro.CRECI !== undefined && primeiro.CRECI.trim() !== ''
        ? primeiro.CRECI
        : null,
  };
}

function nonEmptyOrNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// A galeria de fotos não vem no objeto RSC "property" (API Vista) — fica fora dele, como
// <img> comum já com o src resolvido (não é lazy-load).
function extractCapaFotoUrl(html: string): string | null {
  const $ = load(html);
  return nonEmptyOrNull(
    $('img[alt^="Imagem da propriedade"]').first().attr('src'),
  );
}

export const parseLoftSites: Parser = (
  conteudo: string,
): AnuncioNormalizado => {
  const property = extractVistaProperty(conteudo);
  const { precoVenda, precoAluguel, disponivelAluguel, disponivelVenda } =
    resolvePrecos(property);
  const { anuncianteNome, codigoCreci } = resolveCorretor(property.Corretor);

  return {
    codigoExterno: property.Codigo,
    precoVenda,
    precoAluguel,
    disponivelAluguel,
    disponivelVenda,
    condominio: resolveMoneyOrNull(property.ValorCondominio),
    iptu: resolveMoneyOrNull(property.ValorIptu),
    area: resolveArea(property),
    quartos: parseIntegerField(property.Dormitorios),
    suites: parseIntegerField(property.Suites),
    banheiros: parseIntegerField(property.TotalBanheiros),
    vagas: parseIntegerField(property.Vagas),
    tipoImovelBruto: nonEmptyOrNull(property.Categoria),
    bairro: nonEmptyOrNull(property.Bairro),
    cidade: nonEmptyOrNull(property.Cidade),
    estado: nonEmptyOrNull(property.UF),
    cep: null,
    endereco: nonEmptyOrNull(property.Endereco),
    numero: nonEmptyOrNull(property.Numero),
    latitude: parseDecimalField(property.Latitude),
    longitude: parseDecimalField(property.Longitude),
    descricao: resolveDescricao(property.DescricaoWeb),
    imagemUrl: extractCapaFotoUrl(conteudo),
    anuncianteNome,
    codigoCreci,
    publicadoEm: null,
    atualizadoEm: null,
  };
};
