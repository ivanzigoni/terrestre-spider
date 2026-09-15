import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';

import type { AnuncioNormalizado, Parser } from '../anuncio-normalizado.js';
import { parseMoneyToCents } from './shared/money.js';

const ENDERECO_FIELD_INDEX = 1;
const PRECO_FIELD_INDEX = 2;
const AREA_FIELD_INDEX = 4;
const BANHEIROS_FIELD_INDEX = 5;
const CONDOMINIO_FIELD_INDEX = 8;
const IPTU_FIELD_INDEX = 9;

function nonEmptyOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().normalize('NFC');
  return trimmed === '' ? null : trimmed;
}

function parseFirstDecimal(value: string): number | null {
  const captured = /(\d+(?:[.,]\d+)?)/.exec(value)?.[1];
  if (captured === undefined) return null;
  const parsed = Number(captured.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractCodigoExterno($: CheerioAPI): string {
  const heading = $('h2.elementor-heading-title')
    .filter((_index, el) => /^COD:/i.test($(el).text().trim()))
    .first();
  const match = /^COD:\s*(\S+)/i.exec(heading.text().trim());
  const codigo = match?.[1];
  if (codigo === undefined) {
    throw new Error('GSA Ativos: heading "COD: ..." não encontrado no HTML');
  }
  return codigo;
}

interface EnderecoGsa {
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
}

function parseEndereco(texto: string): EnderecoGsa {
  const trimmed = texto.trim();
  const dashIndex = Math.max(
    trimmed.lastIndexOf('–'),
    trimmed.lastIndexOf('-'),
  );
  if (dashIndex === -1) {
    return { endereco: nonEmptyOrNull(trimmed), numero: null, bairro: null };
  }

  const antesDash = trimmed.slice(0, dashIndex).trim();
  const bairro = trimmed.slice(dashIndex + 1).trim();

  const numeroMatch = /(\d{1,6}[\w-]{0,10})$/.exec(antesDash);
  const numero = numeroMatch?.[1];
  if (numero === undefined) {
    return {
      endereco: nonEmptyOrNull(antesDash),
      numero: null,
      bairro: nonEmptyOrNull(bairro),
    };
  }

  const endereco = antesDash.slice(0, antesDash.length - numero.length).trim();
  return {
    endereco: nonEmptyOrNull(endereco),
    numero: nonEmptyOrNull(numero),
    bairro: nonEmptyOrNull(bairro),
  };
}

export const parseGsaAtivos: Parser = (
  conteudo: string,
): AnuncioNormalizado => {
  const $ = load(conteudo);

  const codigoExterno = extractCodigoExterno($);
  const campos = $('.jet-listing-dynamic-field__content');

  const { endereco, numero, bairro } = parseEndereco(
    campos.eq(ENDERECO_FIELD_INDEX).text(),
  );
  const precoTexto = campos.eq(PRECO_FIELD_INDEX).text();
  const precoCentavos = parseMoneyToCents(precoTexto);

  const areaMatch = /ABL:\s*([\d.,]+)\s*m/i.exec(
    campos.eq(AREA_FIELD_INDEX).text(),
  );
  const area =
    areaMatch?.[1] !== undefined ? parseFirstDecimal(areaMatch[1]) : null;

  const banheirosMatch = /Banheiro\(s\):\s*(\d+)/i.exec(
    campos.eq(BANHEIROS_FIELD_INDEX).text(),
  );
  const banheiros =
    banheirosMatch?.[1] !== undefined
      ? Number.parseInt(banheirosMatch[1], 10)
      : null;

  const condominioMatch = /Valor do Condom[íi]nio:\s*(.+)/i.exec(
    campos.eq(CONDOMINIO_FIELD_INDEX).text(),
  );
  const condominio =
    condominioMatch?.[1] !== undefined
      ? parseMoneyToCents(condominioMatch[1])
      : null;

  const iptuMatch = /IPTU:\s*(.+)/i.exec(campos.eq(IPTU_FIELD_INDEX).text());
  const iptu =
    iptuMatch?.[1] !== undefined ? parseMoneyToCents(iptuMatch[1]) : null;

  const tipoTransacao = $('span.jet-listing-dynamic-terms__link')
    .first()
    .text()
    .trim();
  const isAluguel = tipoTransacao.toLowerCase().includes('aluguel');

  return {
    codigoExterno,
    precoVenda: isAluguel ? null : precoCentavos,
    precoAluguel: isAluguel ? precoCentavos : null,
    disponivelAluguel: isAluguel,
    disponivelVenda: !isAluguel,
    condominio,
    iptu,
    area,
    quartos: null,
    suites: null,
    banheiros,
    vagas: null,
    tipoImovelBruto: null,
    bairro,
    cidade: null,
    estado: null,
    cep: null,
    endereco,
    numero,
    latitude: null,
    longitude: null,
    descricao: null,
    anuncianteNome: null,
    codigoCreci: null,
    publicadoEm: null,
    atualizadoEm: null,
  };
};
