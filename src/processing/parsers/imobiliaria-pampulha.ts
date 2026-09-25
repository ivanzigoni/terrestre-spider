import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';

import type { AnuncioNormalizado, Parser } from '../anuncio-normalizado.js';
import { parseMoneyToCents } from './shared/money.js';
import { aparar, normalizarEspacos } from './shared/texto.js';

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
  // span.codigo-imv (antigo "COD: NNNNNN") não existe mais no HTML — confirmado ao
  // vivo contra duas URLs reais, sobrou só a regra CSS no <style>. Site é WordPress
  // (mesma plataforma do GSA Ativos); usamos o postid injetado via body_class() como
  // identificador estável por imóvel.
  const bodyClass = $('body').attr('class') ?? '';
  const match = /\bpostid-(\d+)\b/.exec(bodyClass);
  const postid = match?.[1];
  if (postid === undefined) {
    throw new Error(
      'Imobiliária Pampulha: postid-<n> não encontrado na classe do <body>',
    );
  }
  return postid;
}

const UNIDADES_AREA = ['m²', 'm2', 'metros quadrados'];
const MARCADORES_TRANSACAO = [
  'à venda',
  'a venda',
  'para alugar',
  'para venda',
];
const PADRAO_NAO_BAIRRO = /\d|quarto|banheiro|vaga|su[ií]te/i;
const PREPOSICOES_DE_LUGAR = new Set(['no', 'na', 'em']);
const CONECTORES_DE_NOME = new Set(['da', 'do', 'de', 'das', 'dos']);

function limparBairro(texto: string): string | null {
  let tokens = normalizarEspacos(texto).split(' ');
  if (PREPOSICOES_DE_LUGAR.has((tokens[0] ?? '').toLowerCase())) {
    tokens = tokens.slice(1);
  }
  if ((tokens[0] ?? '').toLowerCase() === 'bairro') {
    tokens = tokens.slice(1);
    if (CONECTORES_DE_NOME.has((tokens[0] ?? '').toLowerCase())) {
      tokens = tokens.slice(1);
    }
  }
  if (
    tokens.length > 1 &&
    (tokens[tokens.length - 1] ?? '').toLowerCase() === 'bh'
  ) {
    tokens = tokens.slice(0, -1);
  }
  return nonEmptyOrNull(tokens.join(' '));
}

function fimDaUltimaArea(titulo: string): number {
  const minusculo = titulo.toLowerCase();
  let fim = -1;
  for (const unidade of UNIDADES_AREA) {
    const indice = minusculo.lastIndexOf(unidade);
    if (indice === -1) continue;
    const ultimoCaractere = minusculo.slice(0, indice).trimEnd().slice(-1);
    if (ultimoCaractere < '0' || ultimoCaractere > '9') continue;
    fim = Math.max(fim, indice + unidade.length);
  }
  return fim;
}

function extractBairroAposVaga(titulo: string): string | null {
  const normalizado = titulo.toLowerCase();
  const vagaIndex = normalizado.lastIndexOf('vaga');
  if (vagaIndex === -1) return null;

  const temPlural = normalizado.startsWith('s', vagaIndex + 'vaga'.length);
  const fimPalavra = vagaIndex + 'vaga'.length + (temPlural ? 1 : 0);
  return nonEmptyOrNull(titulo.slice(fimPalavra));
}

function extractBairroAposArea(titulo: string): string | null {
  const fim = fimDaUltimaArea(titulo);
  if (fim === -1) return null;

  const resto = aparar(titulo.slice(fim)).split('–').join('-');
  const segmentos = resto.split(' - ');
  const ultimoSegmento = segmentos[segmentos.length - 1] ?? '';
  const bairro = limparBairro(aparar(ultimoSegmento));
  if (bairro === null || PADRAO_NAO_BAIRRO.test(bairro)) return null;
  return bairro;
}

function extractBairroEntreTransacaoEArea(titulo: string): string | null {
  const minusculo = titulo.toLowerCase();
  for (const marcador of MARCADORES_TRANSACAO) {
    const inicio = minusculo.indexOf(marcador);
    if (inicio === -1) continue;

    const depoisDoMarcador = inicio + marcador.length;
    const fim = minusculo.indexOf(' com ', depoisDoMarcador);
    if (fim === -1) continue;

    const primeiroDigito = minusculo.charAt(fim + ' com '.length);
    if (primeiroDigito < '0' || primeiroDigito > '9') continue;
    return limparBairro(titulo.slice(depoisDoMarcador, fim));
  }
  return null;
}

function extractBairroDoTitulo(titulo: string): string | null {
  return (
    extractBairroAposVaga(titulo) ??
    extractBairroAposArea(titulo) ??
    extractBairroEntreTransacaoEArea(titulo)
  );
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
  // span.codigo-imv sumiu (ver extractCodigoExterno acima) — o <h2> do título é único
  // na página nas amostras confirmadas.
  const titulo = $('h2').first().text().trim();
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
    disponivelAluguel: isAluguel,
    disponivelVenda: !isAluguel,
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
    imagemUrl: nonEmptyOrNull($('meta[property="og:image"]').attr('content')),
    anuncianteNome: null,
    codigoCreci: null,
    publicadoEm: null,
    atualizadoEm: null,
  };
};
