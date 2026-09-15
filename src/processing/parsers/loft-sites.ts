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
    Dormitorios: z.string().optional(),
    Suites: z.string().optional(),
    TotalBanheiros: z.string().optional(),
    Vagas: z.string().optional(),
    AreaTotal: z.string().optional(),
    AreaPrivativa: z.string().optional(),
    ValorVenda: z.string().optional(),
    ValorLocacao: z.string().optional(),
    ValorIptu: z.string().optional(),
    ValorCondominio: z.string().optional(),
    Endereco: z.string().optional(),
    Numero: z.string().optional(),
    Bairro: z.string().optional(),
    Cidade: z.string().optional(),
    UF: z.string().optional(),
    Status: z.string().optional(),
    Latitude: z.string().optional(),
    Longitude: z.string().optional(),
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

function resolvePrecos(property: VistaProperty): {
  precoVenda: number | null;
  precoAluguel: number | null;
} {
  const valorVenda = resolveMoneyOrNull(property.ValorVenda);
  const valorLocacao = resolveMoneyOrNull(property.ValorLocacao);
  const status = property.Status?.trim().toLowerCase();

  return {
    precoVenda: status === 'aluguel' ? null : valorVenda,
    precoAluguel: status === 'venda' ? null : valorLocacao,
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

export const parseLoftSites: Parser = (
  conteudo: string,
): AnuncioNormalizado => {
  const property = extractVistaProperty(conteudo);
  const { precoVenda, precoAluguel } = resolvePrecos(property);
  const { anuncianteNome, codigoCreci } = resolveCorretor(property.Corretor);

  return {
    codigoExterno: property.Codigo,
    precoVenda,
    precoAluguel,
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
    anuncianteNome,
    codigoCreci,
    publicadoEm: null,
    atualizadoEm: null,
  };
};
