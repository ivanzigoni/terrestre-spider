import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';

import type { Parser } from '../anuncio-normalizado.js';
import { parseMoneyToCents } from './shared/money.js';

type TipoTransacao = 'aluguel' | 'venda';

type Caracteristica = 'area' | 'banheiros' | 'quartos' | 'suites' | 'vagas';

interface CaracteristicasImovel {
  area: number | null;
  quartos: number | null;
  banheiros: number | null;
  vagas: number | null;
  suites: number | null;
}

interface ValoresCondominioEIptu {
  condominio: number | null;
  iptu: number | null;
}

interface InfoBreadcrumb {
  tipoTransacao: TipoTransacao;
  tipoImovelBruto: string | null;
  bairro: string | null;
}

function extractCodigoExterno($: CheerioAPI): string {
  const texto = $('#cod-principal').first().text();
  const match = /\d+/.exec(texto);
  if (match === null) {
    throw new Error(
      `código do imóvel (Imoview) não encontrado ou sem dígitos em "${texto.trim()}"`,
    );
  }
  return match[0];
}

// O template do Imoview formata preço como "R$ X até R$ Y" mesmo quando X e Y
// são o mesmo valor (não é sempre uma faixa de verdade) — usa o primeiro valor
// da faixa, que é sempre o preço de fato (ou o "a partir de", nos raros casos
// de faixa real).
function primeiroValorDaFaixa(texto: string): string {
  const [primeiro] = texto.split(/\baté\b/i);
  return primeiro ?? texto;
}

// Preço ausente ("Sob consulta") é um valor legítimo do anúncio, não uma falha
// de extração — o anúncio segue válido com precoVenda/precoAluguel nulos.
function extractPrecoCentavos($: CheerioAPI): number | null {
  for (const el of $('h6.preco-imovel').toArray()) {
    const centavos = parseMoneyToCents(primeiroValorDaFaixa($(el).text()));
    if (centavos !== null) return centavos;
  }
  return null;
}

function inferTipoTransacao(href: string): TipoTransacao {
  const hrefNormalizado = href.toLowerCase();
  if (hrefNormalizado.includes('/aluguel')) return 'aluguel';
  if (hrefNormalizado.includes('/venda')) return 'venda';
  throw new Error(
    `não foi possível inferir tipo de transação (venda/aluguel) a partir do link "${href}"`,
  );
}

function extractInfoBreadcrumb($: CheerioAPI): InfoBreadcrumb {
  const itens = $('ol.breadcrumb > li.breadcrumb-item').toArray();
  if (itens.length < 2) {
    throw new Error(
      'breadcrumb do imóvel (Imoview) não encontrado ou incompleto',
    );
  }

  const itensRelevantes = itens.slice(1).filter((item) => {
    const $item = $(item);
    return (
      !$item.hasClass('active') && $item.attr('id') !== 'breadcrumb-endereco'
    );
  });

  const itemTransacao = itensRelevantes[0];
  if (itemTransacao === undefined) {
    throw new Error(
      'breadcrumb do imóvel (Imoview) não contém item de transação',
    );
  }

  const hrefTransacao = $(itemTransacao).find('a').attr('href') ?? '';
  const tipoTransacao = inferTipoTransacao(hrefTransacao);

  const textoOuNull = (
    item: (typeof itensRelevantes)[number] | undefined,
  ): string | null => {
    if (item === undefined) return null;
    const texto = $(item).text().trim();
    return texto.length > 0 ? texto : null;
  };

  const tipoImovelBruto =
    itensRelevantes.length === 3 ? textoOuNull(itensRelevantes[1]) : null;
  const bairro =
    itensRelevantes.length >= 2
      ? textoOuNull(itensRelevantes[itensRelevantes.length - 1])
      : null;

  return { tipoTransacao, tipoImovelBruto, bairro };
}

function extractCondominioEIptu($: CheerioAPI): ValoresCondominioEIptu {
  let condominio: number | null = null;
  let iptu: number | null = null;

  for (const label of $('p.p-cinza').toArray()) {
    const $label = $(label);
    const rotulo = $label.text().trim().toLowerCase();
    const valor = $label.next('h6').text();

    if (rotulo.startsWith('condom') && condominio === null) {
      condominio = parseMoneyToCents(valor);
    } else if (rotulo === 'iptu' && iptu === null) {
      iptu = parseMoneyToCents(valor);
    }
  }

  return { condominio, iptu };
}

function classificarIconeDetalhe(texto: string): Caracteristica | null {
  const normalizado = texto.toLowerCase();
  if (normalizado.includes('quarto')) return 'quartos';
  if (normalizado.includes('banheiro')) return 'banheiros';
  if (normalizado.includes('vaga')) return 'vagas';
  if (normalizado.includes('suíte') || normalizado.includes('suite'))
    return 'suites';
  if (normalizado.includes('m²') || normalizado.includes('m2')) return 'area';
  return null;
}

function extractPrimeiroNumero(texto: string): number | null {
  const match = /\d+(?:,\d+)?/.exec(texto);
  if (match === null) return null;
  return Number.parseFloat(match[0].replace(',', '.'));
}

function extractCaracteristicas($: CheerioAPI): CaracteristicasImovel {
  const caracteristicas: CaracteristicasImovel = {
    area: null,
    quartos: null,
    banheiros: null,
    vagas: null,
    suites: null,
  };

  for (const el of $('div.icon_detalhes').toArray()) {
    const texto = $(el).text();
    const categoria = classificarIconeDetalhe(texto);
    if (categoria === null || caracteristicas[categoria] !== null) continue;

    const numero = extractPrimeiroNumero(texto);
    if (numero === null) continue;

    caracteristicas[categoria] =
      categoria === 'area' ? numero : Math.trunc(numero);
  }

  return caracteristicas;
}

function extractDescricao($: CheerioAPI): string | null {
  const paragrafo = $('p.descricao').first();
  if (paragrafo.length === 0) return null;

  paragrafo.find('br').replaceWith('\n');
  const linhas = paragrafo
    .text()
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0);

  return linhas.length > 0 ? linhas.join('\n') : null;
}

export const parseImoview: Parser = (conteudo) => {
  const $ = load(conteudo);

  const codigoExterno = extractCodigoExterno($);
  const precoCentavos = extractPrecoCentavos($);
  const { tipoTransacao, tipoImovelBruto, bairro } = extractInfoBreadcrumb($);
  const { condominio, iptu } = extractCondominioEIptu($);
  const { area, quartos, banheiros, vagas, suites } = extractCaracteristicas($);
  const descricao = extractDescricao($);

  return {
    codigoExterno,
    precoVenda: tipoTransacao === 'venda' ? precoCentavos : null,
    precoAluguel: tipoTransacao === 'aluguel' ? precoCentavos : null,
    disponivelAluguel: tipoTransacao === 'aluguel',
    disponivelVenda: tipoTransacao === 'venda',
    condominio,
    iptu,
    area,
    quartos,
    suites,
    banheiros,
    vagas,
    tipoImovelBruto,
    bairro,
    cidade: null,
    estado: null,
    cep: null,
    endereco: null,
    numero: null,
    latitude: null,
    longitude: null,
    descricao,
    anuncianteNome: null,
    codigoCreci: null,
    publicadoEm: null,
    atualizadoEm: null,
  };
};
