import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';

import type { AnuncioNormalizado, Parser } from '../anuncio-normalizado.js';
import { parseEnderecoGsa } from './gsa-ativos-endereco.js';
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

export const parseGsaAtivos: Parser = (
  conteudo: string,
): AnuncioNormalizado => {
  const $ = load(conteudo);

  const codigoExterno = extractCodigoExterno($);
  const campos = $('.jet-listing-dynamic-field__content');

  const { endereco, numero, bairro, cidade, estado, cep } = parseEnderecoGsa(
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
    cidade,
    estado,
    cep,
    endereco,
    numero,
    latitude: null,
    longitude: null,
    descricao: null,
    imagemUrl: nonEmptyOrNull(
      $('.elementor-widget-image-carousel a[data-elementor-open-lightbox]')
        .first()
        .attr('href'),
    ),
    anuncianteNome: null,
    codigoCreci: null,
    publicadoEm: null,
    atualizadoEm: null,
  };
};
