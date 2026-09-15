import { load } from 'cheerio';

import type { AnuncioNormalizado, Parser } from '../anuncio-normalizado.js';
import { parseMoneyToCents } from './shared/money.js';

function extractWindowStringVar(html: string, varName: string): string | null {
  const match = new RegExp(`window\\.${varName}\\s*=\\s*'([^']*)'`).exec(html);
  const value = match?.[1]?.trim();
  return value === undefined || value === '' ? null : value;
}

function extractWindowNumberVar(html: string, varName: string): number | null {
  const match = new RegExp(`window\\.${varName}\\s*=\\s*([\\d.]+)`).exec(html);
  if (match === null) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractCreci(html: string): string | null {
  const match = /CRECI[:\s-]*(\d+)/i.exec(html);
  return match?.[1] ?? null;
}

function parseFirstDecimal(value: string | null): number | null {
  if (value === null) return null;
  const captured = /(\d+(?:[.,]\d+)?)/.exec(value)?.[1];
  if (captured === undefined) return null;
  const parsed = Number(captured.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFirstInteger(value: string | null): number | null {
  if (value === null) return null;
  const captured = /(\d+)/.exec(value)?.[1];
  if (captured === undefined) return null;
  const parsed = Number.parseInt(captured, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonEmptyOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

interface EnderecoNetimoveis {
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
}

function splitOnce(texto: string, separator: string): [string, string | null] {
  const index = texto.indexOf(separator);
  if (index === -1) return [texto, null];
  return [texto.slice(0, index), texto.slice(index + separator.length)];
}

function splitOnDashSeparator(texto: string): [string, string | null] {
  const [antesEnDash, depoisEnDash] = splitOnce(texto, '–');
  if (depoisEnDash !== null) return [antesEnDash, depoisEnDash];
  return splitOnce(texto, '-');
}

function parseEndereco(texto: string | null): EnderecoNetimoveis {
  if (texto === null) return { endereco: null, bairro: null, cidade: null };

  const [logradouro, resto] = splitOnce(texto, ',');
  if (resto === null) {
    return { endereco: nonEmptyOrNull(texto), bairro: null, cidade: null };
  }

  const [bairro, cidade] = splitOnDashSeparator(resto);
  return {
    endereco: nonEmptyOrNull(logradouro),
    bairro: nonEmptyOrNull(bairro),
    cidade: nonEmptyOrNull(cidade),
  };
}

export const parseNetimoveis: Parser = (
  conteudo: string,
): AnuncioNormalizado => {
  const $ = load(conteudo);

  const codigoExterno = nonEmptyOrNull($('#codigoImovel span').first().text());
  if (codigoExterno === null) {
    throw new Error(
      'Netimóveis: código do imóvel (#codigoImovel span) não encontrado no HTML',
    );
  }

  const extractCaracteristica = (className: string): string | null => {
    const elemento = $(`.caracteristica.${className}`).first();
    if (elemento.length === 0) return null;
    const clone = elemento.clone();
    clone.find('.descricao').remove();
    const texto = clone
      .text()
      .replace(/\u00a0/g, ' ')
      .trim();
    return texto === '' ? null : texto;
  };

  const extractDetailValue = (label: string): string | null => {
    let valor: string | null = null;
    $('.detail-name').each((_index, elemento) => {
      const nome = $(elemento).text().trim().toLowerCase();
      if (nome === label.toLowerCase()) {
        const texto = $(elemento).next('.detail-value').text().trim();
        valor = texto === '' ? null : texto;
      }
    });
    return valor;
  };

  const transacao = extractWindowStringVar(conteudo, 'transacao');
  const isAluguel = (transacao ?? '').toLowerCase().includes('loca');
  const valorCents = parseMoneyToCents(
    extractWindowNumberVar(conteudo, 'valor'),
  );

  const enderecoTexto = nonEmptyOrNull(
    $('#titulo').siblings('.text-gray').first().text(),
  );
  const endereco = parseEndereco(enderecoTexto);

  return {
    codigoExterno,
    precoVenda: isAluguel ? null : valorCents,
    precoAluguel: isAluguel ? valorCents : null,
    disponivelAluguel: isAluguel,
    disponivelVenda: !isAluguel,
    condominio: parseMoneyToCents(extractDetailValue('Condomínio')),
    iptu: parseMoneyToCents(extractDetailValue('Iptu')),
    area: parseFirstDecimal(extractCaracteristica('area')),
    quartos: parseFirstInteger(extractCaracteristica('quartos')),
    suites: parseFirstInteger(extractCaracteristica('suites')),
    banheiros: parseFirstInteger(extractCaracteristica('banheiros')),
    vagas: parseFirstInteger(extractCaracteristica('vagas')),
    tipoImovelBruto: extractWindowStringVar(conteudo, 'tipoImovel'),
    bairro: endereco.bairro,
    cidade: endereco.cidade,
    estado: null,
    cep: null,
    endereco: endereco.endereco,
    numero: null,
    latitude: null,
    longitude: null,
    descricao: null,
    anuncianteNome: nonEmptyOrNull($('#h4-nomeAgencia').first().text()),
    codigoCreci: extractCreci(conteudo),
    publicadoEm: null,
    atualizadoEm: null,
  };
};
