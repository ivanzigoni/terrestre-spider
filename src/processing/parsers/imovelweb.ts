import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { z } from 'zod';

import type { AnuncioNormalizado, Parser } from '../anuncio-normalizado.js';
import { parseMoneyToCents } from './shared/money.js';

const apartmentAddressSchema = z.object({
  addressLocality: z.string().nullable().optional(),
  addressRegion: z.string().nullable().optional(),
  streetAddress: z.string().nullable().optional(),
});

const apartmentLdJsonSchema = z.object({
  '@type': z.string(),
  numberOfRooms: z.number().nullable().optional(),
  numberOfBedrooms: z.number().nullable().optional(),
  numberOfBathroomsTotal: z.number().nullable().optional(),
  floorSize: z
    .object({
      value: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
  address: apartmentAddressSchema.nullable().optional(),
});

type ApartmentLdJson = z.infer<typeof apartmentLdJsonSchema>;

function nonEmptyOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().normalize('NFC');
  return trimmed === '' ? null : trimmed;
}

function extractCodigoExterno($: CheerioAPI, fonte: string): string {
  const ogUrl = $('meta[property="og:url"]').attr('content') ?? '';
  const match = /(\d{5,12})(?:\.html)?$/.exec(ogUrl);
  const codigo = match?.[1];
  if (codigo === undefined) {
    throw new Error(
      `${fonte}: não foi possível extrair o código do imóvel a partir de og:url ("${ogUrl}")`,
    );
  }
  return codigo;
}

// Blocos institucionais (site inteiro, não o anúncio) presentes em toda página
// desta plataforma — o tipo do imóvel em si varia (Apartment, House, etc.) e
// não vale a pena enumerar, então filtra pelo que não é imóvel, não pelo que é.
const TIPOS_NAO_IMOVEL = new Set(['WebSite', 'Organization', 'BreadcrumbList']);

function extractApartmentLdJson($: CheerioAPI): ApartmentLdJson | null {
  for (const script of $('script[type="application/ld+json"]').toArray()) {
    const raw = $(script).contents().text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      continue;
    const tipo = (parsed as Record<string, unknown>)['@type'];
    if (typeof tipo !== 'string' || TIPOS_NAO_IMOVEL.has(tipo)) continue;

    const result = apartmentLdJsonSchema.safeParse(parsed);
    if (result.success) return result.data;
  }
  return null;
}

interface PrecoTransacao {
  precoVenda: number | null;
  precoAluguel: number | null;
  disponivelAluguel: boolean;
  disponivelVenda: boolean;
}

function extractPreco($: CheerioAPI): PrecoTransacao {
  const texto = $('.price-container-property .price-value').first().text();
  const centavos = parseMoneyToCents(texto);
  const isAluguel = texto.toLowerCase().includes('aluguel');
  return {
    precoVenda: isAluguel ? null : centavos,
    precoAluguel: isAluguel ? centavos : null,
    disponivelAluguel: isAluguel,
    disponivelVenda: !isAluguel,
  };
}

interface DespesasImovel {
  condominio: number | null;
  iptu: number | null;
}

function extractCondominioEIptu($: CheerioAPI): DespesasImovel {
  const texto = $('.price-container-property .price-extra .price-expenses')
    .first()
    .text();
  const condominioMatch = /Condom[íi]nio\s*(R\$\s*[\d.,]+)/i.exec(texto);
  const iptuMatch = /IPTU\s*(R\$\s*[\d.,]+)/i.exec(texto);
  return {
    condominio:
      condominioMatch?.[1] !== undefined
        ? parseMoneyToCents(condominioMatch[1])
        : null,
    iptu: iptuMatch?.[1] !== undefined ? parseMoneyToCents(iptuMatch[1]) : null,
  };
}

function extractIconNumero($: CheerioAPI, iconClass: string): number | null {
  const li = $(`li.icon-feature i.${iconClass}`).first().parent();
  if (li.length === 0) return null;
  const match = /\d+/.exec(li.text());
  return match === null ? null : Number.parseInt(match[0], 10);
}

interface RuaNumero {
  endereco: string | null;
  numero: string | null;
}

function splitRuaNumero(streetAddress: string): RuaNumero {
  const trimmed = streetAddress.trim();
  const match = /(\d{1,6}[\w-]{0,10})$/.exec(trimmed);
  const numero = match?.[1];
  if (numero === undefined) {
    return { endereco: nonEmptyOrNull(trimmed), numero: null };
  }
  return {
    endereco: nonEmptyOrNull(trimmed.slice(0, trimmed.length - numero.length)),
    numero: nonEmptyOrNull(numero),
  };
}

interface CidadeEstado {
  cidade: string | null;
  estado: string | null;
}

function splitCidadeEstado(addressLocality: string): CidadeEstado {
  const partes = addressLocality
    .split(',')
    .map((parte) => parte.trim())
    .filter((parte) => parte !== '');
  return {
    cidade: nonEmptyOrNull(partes[0]),
    estado: nonEmptyOrNull(partes[1]),
  };
}

function extractCodigoCreci($: CheerioAPI): string | null {
  for (const li of $(
    '[class*="publiserCodes-module__list-publisher-codes"] li',
  ).toArray()) {
    const $li = $(li);
    const rotulo = $li.find('span').first().text().trim();
    if (!rotulo.toLowerCase().startsWith('creci')) continue;

    const textoCompleto = $li.text().trim();
    const valor = textoCompleto.startsWith(rotulo)
      ? textoCompleto.slice(rotulo.length).trim()
      : textoCompleto;
    return nonEmptyOrNull(valor.replace(/^CRECI:?\s*/i, ''));
  }
  return null;
}

export function parseImovelwebTemplate(
  conteudo: string,
  fonte: string,
): AnuncioNormalizado {
  const $ = load(conteudo);

  const codigoExterno = extractCodigoExterno($, fonte);
  const apartment = extractApartmentLdJson($);
  if (apartment === null) {
    throw new Error(`${fonte}: bloco ld+json do imóvel não encontrado no HTML`);
  }

  const { precoVenda, precoAluguel, disponivelAluguel, disponivelVenda } =
    extractPreco($);
  const { condominio, iptu } = extractCondominioEIptu($);
  const vagas = extractIconNumero($, 'icon-cochera');
  const suites = extractIconNumero($, 'icon-toilete');

  const streetAddress = apartment.address?.streetAddress;
  const { endereco, numero } =
    streetAddress === null || streetAddress === undefined
      ? { endereco: null, numero: null }
      : splitRuaNumero(streetAddress);

  const addressLocality = apartment.address?.addressLocality;
  const { cidade, estado } =
    addressLocality === null || addressLocality === undefined
      ? { cidade: null, estado: null }
      : splitCidadeEstado(addressLocality);

  return {
    codigoExterno,
    precoVenda,
    precoAluguel,
    disponivelAluguel,
    disponivelVenda,
    condominio,
    iptu,
    area: apartment.floorSize?.value ?? null,
    quartos: apartment.numberOfBedrooms ?? apartment.numberOfRooms ?? null,
    suites,
    banheiros: apartment.numberOfBathroomsTotal ?? null,
    vagas,
    tipoImovelBruto: null,
    bairro: nonEmptyOrNull(apartment.address?.addressRegion),
    cidade,
    estado,
    cep: null,
    endereco,
    numero,
    latitude: null,
    longitude: null,
    descricao: nonEmptyOrNull($('#longDescription').first().text()),
    anuncianteNome: nonEmptyOrNull(
      $('[data-qa="linkMicrositioAnunciante"]').first().text(),
    ),
    codigoCreci: extractCodigoCreci($),
    publicadoEm: null,
    atualizadoEm: null,
  };
}

export const parseImovelweb: Parser = (conteudo: string): AnuncioNormalizado =>
  parseImovelwebTemplate(conteudo, 'Imovelweb');
