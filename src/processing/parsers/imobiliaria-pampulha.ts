import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';

import type { AnuncioNormalizado, Parser } from '../anuncio-normalizado.js';
import { parseMoneyToCents } from './shared/money.js';

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

function extractContagem(texto: string, singular: string): number | null {
  const normalizado = texto.replace(/\s+/g, ' ');
  const match = new RegExp(`(\\d{1,4})\\s{1,3}${singular}s?`, 'i').exec(
    normalizado,
  );
  const captured = match?.[1];
  return captured === undefined ? null : Number.parseInt(captured, 10);
}

function extractCodigoExterno($: CheerioAPI): string {
  const texto = $('span.codigo-imv').first().text();
  const match = /COD:\s*(\S+)/i.exec(texto);
  const codigo = match?.[1];
  if (codigo === undefined) {
    throw new Error(
      'Imobiliária Pampulha: span.codigo-imv com "COD: ..." não encontrado no HTML',
    );
  }
  return codigo;
}

function extractBairroDoTitulo(titulo: string): string | null {
  const normalizado = titulo.toLowerCase();
  const vagaIndex = normalizado.lastIndexOf('vaga');
  if (vagaIndex === -1) return null;

  const temPlural = normalizado.startsWith('s', vagaIndex + 'vaga'.length);
  const fimPalavra = vagaIndex + 'vaga'.length + (temPlural ? 1 : 0);
  return nonEmptyOrNull(titulo.slice(fimPalavra));
}

function extractTipoImovelBruto(titulo: string): string | null {
  const match = /^(\S+)/.exec(titulo.trim());
  return match?.[1] !== undefined ? nonEmptyOrNull(match[1]) : null;
}

export const parseImobiliariaPampulha: Parser = (
  conteudo: string,
): AnuncioNormalizado => {
  const $ = load(conteudo);

  const codigoExterno = extractCodigoExterno($);
  const titulo = $('span.codigo-imv').prev('h2').first().text().trim();
  const isAluguel = /alug/i.test(titulo);

  const precoTexto = $('div.favoritos span').first().text();
  const precoCentavos = parseMoneyToCents(precoTexto);

  const favoritosParagrafos = $('div.favoritos p')
    .toArray()
    .map((p) => $(p).text().trim());
  const condominioTexto = favoritosParagrafos.find((texto) =>
    /^CONDOM[ÍI]NIO:/i.test(texto),
  );
  const iptuTexto = favoritosParagrafos.find((texto) => /^IPTU:/i.test(texto));
  const condominio =
    condominioTexto === undefined
      ? null
      : parseMoneyToCents(condominioTexto.replace(/^CONDOM[ÍI]NIO:\s*/i, ''));
  const iptu =
    iptuTexto === undefined
      ? null
      : parseMoneyToCents(iptuTexto.replace(/^IPTU:\s*/i, ''));

  const infoTexto = $('div.property-info-single').first().text();
  const areaMatch = /Área\s*total\s*([\d.,]+)\s*m/i.exec(infoTexto);
  const area =
    areaMatch?.[1] !== undefined ? parseFirstDecimal(areaMatch[1]) : null;

  return {
    codigoExterno,
    precoVenda: isAluguel ? null : precoCentavos,
    precoAluguel: isAluguel ? precoCentavos : null,
    condominio,
    iptu,
    area,
    quartos: extractContagem(infoTexto, 'Quarto'),
    suites: null,
    banheiros: extractContagem(infoTexto, 'Banheiro'),
    vagas: extractContagem(infoTexto, 'Vaga'),
    tipoImovelBruto: extractTipoImovelBruto(titulo),
    bairro: extractBairroDoTitulo(titulo),
    cidade: null,
    estado: null,
    cep: null,
    endereco: null,
    numero: null,
    latitude: null,
    longitude: null,
    descricao: nonEmptyOrNull($('div.text-content-big p').first().text()),
    anuncianteNome: null,
    codigoCreci: null,
    publicadoEm: null,
    atualizadoEm: null,
  };
};
