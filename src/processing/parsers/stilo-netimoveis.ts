import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';

import type { AnuncioNormalizado, Parser } from '../anuncio-normalizado.js';
import { parseMoneyToCents } from './shared/money.js';

const CIDADE_CONHECIDA = 'Belo Horizonte';

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
  const codigo = nonEmptyOrNull($('#codigoImovel span').first().text());
  if (codigo === null) {
    throw new Error(
      'StiloNetimóveis: #codigoImovel span não encontrado no HTML',
    );
  }
  return codigo;
}

interface EnderecoStilo {
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
}

function parseEndereco(texto: string): EnderecoStilo {
  const partes = texto.trim().split(',');
  const rua = partes[0]?.trim();
  const numero = partes[1]?.trim();
  const restante = partes.slice(2).join(',').trim();

  if (
    rua === undefined ||
    numero === undefined ||
    !/^\d/.test(numero) ||
    restante === ''
  ) {
    return {
      endereco: nonEmptyOrNull(texto),
      numero: null,
      bairro: null,
      cidade: null,
    };
  }

  const cidadeEncontrada = restante
    .toLowerCase()
    .endsWith(CIDADE_CONHECIDA.toLowerCase())
    ? CIDADE_CONHECIDA
    : null;
  const bairroBruto =
    cidadeEncontrada === null
      ? restante
      : restante.slice(0, restante.length - cidadeEncontrada.length);

  return {
    endereco: nonEmptyOrNull(rua),
    numero: nonEmptyOrNull(numero),
    bairro: nonEmptyOrNull(bairroBruto.replace(/\([^()]*\)/g, '').trim()),
    cidade: cidadeEncontrada,
  };
}

function extractPriceMap($: CheerioAPI): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const detail of $('section.details.prices div.detail').toArray()) {
    const nome = $(detail).find('.detail-name').first();
    const valor = $(detail).find('.detail-value').first();
    if (nome.length === 0 || valor.length === 0) continue;

    const chave = nome.text().trim().toLowerCase();
    const texto = valor.text().trim();
    if (chave !== '' && texto !== '') mapa.set(chave, texto);
  }
  return mapa;
}

function findByIncludes(
  mapa: Map<string, string>,
  termo: string,
): string | null {
  for (const [chave, valor] of mapa) {
    if (chave.includes(termo)) return valor;
  }
  return null;
}

function extractDescricao($: CheerioAPI): string | null {
  const heading = $('h4')
    .filter((_index, el) => $(el).text().trim() === 'Mais sobre este imóvel')
    .first();
  if (heading.length === 0) return null;

  const corpo = heading.closest('section').find('div.text-justify').first();
  return nonEmptyOrNull(corpo.text());
}

export const parseStiloNetimoveis: Parser = (
  conteudo: string,
): AnuncioNormalizado => {
  const $ = load(conteudo);

  const codigoExterno = extractCodigoExterno($);
  const titulo = $('#titulo').first().text().replace(/\s+/g, ' ').trim();
  const tipoImovelBruto = nonEmptyOrNull(/^(\S+)/.exec(titulo)?.[1]);

  const enderecoTexto = $('#titulo').next('div.mb-1.text-gray').first().text();
  const { endereco, numero, bairro, cidade } = parseEndereco(enderecoTexto);

  const precos = extractPriceMap($);
  const precoVenda = parseMoneyToCents(findByIncludes(precos, 'venda'));
  const precoAluguel = parseMoneyToCents(findByIncludes(precos, 'loca'));
  const condominio = parseMoneyToCents(findByIncludes(precos, 'condom'));
  const iptu = parseMoneyToCents(findByIncludes(precos, 'iptu'));

  const featuresTexto = $('section.details.features').text();
  const areaMatch = /área aproximada\s*([\d.,]+)\s*m/i.exec(featuresTexto);

  return {
    codigoExterno,
    precoVenda,
    precoAluguel,
    disponivelVenda: precoVenda !== null,
    disponivelAluguel: precoAluguel !== null,
    condominio,
    iptu,
    area: areaMatch?.[1] !== undefined ? parseFirstDecimal(areaMatch[1]) : null,
    quartos: extractContagem(featuresTexto, 'quarto'),
    suites: null,
    banheiros: extractContagem(featuresTexto, 'banheiro'),
    vagas: extractContagem(featuresTexto, 'vaga'),
    tipoImovelBruto,
    bairro,
    cidade,
    estado: null,
    cep: null,
    endereco,
    numero,
    latitude: null,
    longitude: null,
    descricao: extractDescricao($),
    anuncianteNome: null,
    codigoCreci: null,
    publicadoEm: null,
    atualizadoEm: null,
  };
};
