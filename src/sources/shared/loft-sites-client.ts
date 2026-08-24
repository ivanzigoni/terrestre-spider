import type { Cheerio, CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';

import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import type { RawListingItem } from '../../persistence/raw-listing-item.js';
import { parseBrlToInteiro } from './parse-brl.js';
import { temValorPlausivel } from './raw-listing-item-plausibilidade.js';

/**
 * Cliente compartilhado para o cluster de 8 imobiliárias sobre o mesmo template de
 * site-building (CDN `cdn.loftsites.com.br`/`loft-analytics.gtmcapital.com.br`,
 * confirmado em `discovery/independentes-diagnostico.md`, Achado 3, e no lote 3 de
 * `.claude/__workdir/integracao-lote/lotes.md`) — sem API, listagem e detalhe
 * renderizados 100% no HTML inicial.
 *
 * Diferente de Imoview/Kenlo, um único conjunto de seletores CSS por classe NÃO cobre os
 * 8 sites: comparando o markup real das 8 páginas de detalhe, o mesmo campo de preço usa
 * pelo menos 3 variantes de classe Tailwind diferentes entre grupos de sites (achado do
 * lote 3). O que É compartilhado e robusto nos 8, confirmado por comparação direta, é a
 * extração por RÓTULO DE TEXTO em português ("Valor venda"/"Valor aluguel", "Banheiros",
 * "Condomínio", "Vagas" presentes nos 8 sem exceção) — por isso este client busca o nó
 * cujo texto próprio bate com um rótulo conhecido, nunca uma classe CSS fixa.
 */

// Ícones de quartos/banheiros/vagas não têm aria-label nem title em nenhum dos 8 sites
// testados — extração por ordem posicional de ícone seria frágil. Rótulo de texto é a
// única âncora confiável encontrada.
const ROTULOS = {
  PRECO_VENDA: ['valor venda'],
  PRECO_ALUGUEL: ['valor aluguel'],
  BANHEIROS: ['banheiros'],
  CONDOMINIO: ['condominio'],
  VAGAS: ['vagas'],
  AREA_TOTAL: ['area total', 'area util', 'area'],
  QUARTOS: ['quartos', 'dormitorios'],
  IPTU: ['iptu'],
} as const;

// Remove ':' à direita antes de comparar — confirmado em produção que o rótulo pode
// carregar o separador no próprio nó de texto (ex.: Casa Pampulha: "Área total: " como
// nó só de rótulo, valor no próximo irmão), não só no formato "rótulo: valor" num nó
// único (achado do lote 3, também coberto pela tentativa 3 de extrairPorRotulo).
function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/:\s*$/, '');
}

// `.clone().children().remove().end()` isola o texto próprio do elemento (exclui texto
// de filhos aninhados) sem depender do enum interno de tipo de nó do domhandler —
// idioma padrão do Cheerio para essa checagem.
function textoProprio($: CheerioAPI, el: Cheerio<AnyNode>): string {
  return $(el).clone().children().remove().end().text();
}

// Aceita tanto o nó só-rótulo ("Valor venda", valor no irmão) quanto o nó rótulo+valor
// combinado ("Banheiros: 2", valor no resto do mesmo nó — tentativa 3 de
// `valorDoRotulo`) — nos dois casos o texto começa exatamente com o rótulo, seguido do
// fim da string, ':' ou espaço. Nunca substring solta no meio do texto (ver
// `encontrarRotuloEl`).
function comecaComRotulo(textoNormalizado: string, rotulo: string): boolean {
  if (textoNormalizado === rotulo) {
    return true;
  }
  return (
    textoNormalizado.startsWith(rotulo) &&
    /^[\s:]/.test(textoNormalizado.slice(rotulo.length))
  );
}

/**
 * Primeiro elemento (em ordem de documento) cujo texto PRÓPRIO normalizado começa com um
 * dos rótulos — nunca `:contains()` do Cheerio, que casa substring em qualquer ancestral
 * do nó (abriria a mesma armadilha do achado do lote 3: em Primer Imóveis, o primeiro
 * "R$" fora do rótulo certo é o valor de Condomínio, não o preço do imóvel).
 */
function encontrarRotuloEl(
  $: CheerioAPI,
  rotulos: string[],
): Cheerio<AnyNode> | null {
  const candidatos = $('*').filter((_, el) => {
    const texto = normalizarTexto(textoProprio($, $(el)));
    return rotulos.some((rotulo) => comecaComRotulo(texto, rotulo));
  });
  return candidatos.length > 0 ? candidatos.first() : null;
}

/**
 * Busca o valor associado a um rótulo já localizado (`rotuloEl`) — nunca no "primeiro
 * R$/número solto da página" (mesma armadilha do parágrafo acima).
 *
 * Quatro tentativas, na ordem, primeiro valor não vazio vence:
 * 1. Texto do próximo irmão do elemento que contém só o rótulo.
 * 2. Texto de um elemento FILHO do próprio rótulo (ex.: Habitar Pampulha:
 *    `<span>Área Total <b>360m²</b></span>` — rótulo e valor no mesmo nó, mas o valor
 *    fica dentro de uma tag aninhada, não como texto solto). Checada antes da tentativa
 *    3 (irmão do pai) porque é um sinal mais específico — a 3 já causou bug real
 *    (pegava o valor de um `<li>` de característica seguinte, sem relação).
 * 3. Texto do próximo irmão do PAI desse elemento (rótulo e valor em contêineres irmãos
 *    diferentes, um nível acima).
 * 4. Resto do texto do próprio nó, após remover o rótulo (rótulo e valor no mesmo nó, ex.
 *    "Banheiros: 2").
 */
function valorDoRotulo(
  rotuloEl: Cheerio<AnyNode>,
  rotulos: string[],
): string | null {
  const doIrmao = rotuloEl.next().text().trim();
  if (doIrmao !== '') {
    return doIrmao;
  }

  const doFilho = rotuloEl.find('*').text().trim();
  if (doFilho !== '') {
    return doFilho;
  }

  const doIrmaoDoPai = rotuloEl.parent().next().text().trim();
  if (doIrmaoDoPai !== '') {
    return doIrmaoDoPai;
  }

  const textoCompleto = normalizarTexto(rotuloEl.text());
  const rotuloEncontrado = rotulos.find((r) => textoCompleto.startsWith(r));
  if (rotuloEncontrado !== undefined) {
    const resto = rotuloEl
      .text()
      .trim()
      .slice(rotuloEncontrado.length)
      .replace(/^[:\s]+/, '')
      .trim();
    if (resto !== '') {
      return resto;
    }
  }

  return null;
}

function extrairPorRotulo($: CheerioAPI, rotulos: string[]): string | null {
  const rotuloEl = encontrarRotuloEl($, rotulos);
  return rotuloEl === null ? null : valorDoRotulo(rotuloEl, rotulos);
}

/**
 * Quartos/banheiros/vagas não seguem o padrão "rótulo: valor" — vêm como ícone (sem
 * `aria-label`/`title`) seguido de um span único "<número> <rótulo>" (ex.: "2
 * Banheiros", "3 Dormitórios"), confirmado no lote 3 contra o markup real da
 * "Características" (Casa Pampulha). `extrairPorRotulo` cobre o padrão rótulo-primeiro
 * (usado por outros campos, ex. IPTU/Condomínio); esta função cobre o padrão
 * número-primeiro específico desses três campos, tentado só depois do primeiro falhar.
 */
function extrairNumeroPertoDoRotulo(
  $: CheerioAPI,
  rotulos: string[],
): number | null {
  let resultado: number | null = null;
  $('*').each((_, el) => {
    if (resultado !== null) {
      return;
    }
    const texto = normalizarTexto(textoProprio($, $(el)));
    const match = /^\d+\s*/.exec(texto);
    if (match?.[0] === undefined) {
      return;
    }
    const resto = texto.slice(match[0].length);
    if (rotulos.some((rotulo) => resto.startsWith(rotulo))) {
      resultado = Number(match[0]);
    }
  });
  return resultado;
}

function extrairNumero($: CheerioAPI, rotulos: string[]): number {
  const viaRotuloPrimeiro = extrairPorRotulo($, rotulos);
  if (viaRotuloPrimeiro !== null) {
    return parseInteiro(viaRotuloPrimeiro);
  }
  return extrairNumeroPertoDoRotulo($, rotulos) ?? 0;
}

function parseMoeda(texto: string | null): number {
  if (texto === null) {
    return 0;
  }
  return parseBrlToInteiro(texto) ?? 0;
}

function parseInteiro(texto: string | null): number {
  if (texto === null) {
    return 0;
  }
  const match = /\d+/.exec(texto.replace(/\./g, ''));
  return match ? Number(match[0]) : 0;
}

function parseArea(texto: string | null): number {
  if (texto === null) {
    return 0;
  }
  const match = /\d+(?:[.,]\d+)?/.exec(texto);
  if (!match) {
    return 0;
  }
  return Math.round(Number(match[0].replace(',', '.')));
}

// `<title>` está presente e populado nos 8 sites testados, sem exceção — `h1` está
// ausente em 3 dos 4 sites verificados diretamente no lote 3, por isso não é usado.
function extrairTitulo($: CheerioAPI): string | null {
  const titulo = $('title').first().text().trim();
  return titulo === '' ? null : titulo;
}

// Padrão "<bairro>, <cidade> - <UF>", como nó de texto PRÓPRIO e ISOLADO (âncora `^...$`,
// não substring solta) — confirmado em 6 dos 8 sites testados diretamente no lote 3
// (Primer Imóveis e Venda Nova Imóveis não bateram com a busca perto do preço — ficam
// sujeitos a confirmação/ajuste no smoke test ao vivo, não presumidos aqui). Âncora
// `^...$` é deliberada: uma busca por substring solta no texto inteiro da página
// (`$('body').text()`) pega elementos sem relação com o imóvel da página (ex.: um
// carrossel de "imóveis similares" mais acima no DOM, cada card com seu próprio bairro —
// confirmado em Casa Pampulha, onde a primeira ocorrência solta era de um card não
// relacionado, "Santa Amélia", enquanto o bairro real do imóvel, "Trevo", só aparecia bem
// mais abaixo). Classe de caractere do meio inclui maiúsculas — bairro/cidade compostos
// por mais de uma palavra têm cada palavra capitalizada (ex. "Belo Horizonte", "Ribeirão
// das Neves"), não só a primeira letra do bloco inteiro.
const LOCALIZACAO_REGEX =
  /^[A-ZÀ-Ú][a-zà-úA-ZÀ-Ú\s]{1,60}, [A-ZÀ-Ú][a-zà-úA-ZÀ-Ú\s]{1,40} - [A-Z]{2}$/;

// Teto de níveis pra subir a partir do rótulo de preço — generoso o bastante pra cobrir
// os wrappers de layout observados nos 8 sites sem degenerar em busca no documento
// inteiro (que reabriria a armadilha do carrossel de imóveis similares, ver acima).
const LOCALIZACAO_MAX_NIVEIS_ACIMA = 8;

/**
 * Busca `localizacao` num ancestral PRÓXIMO do rótulo de preço já encontrado — nunca no
 * documento inteiro. Sobe um nível de cada vez a partir de `ancoraEl` e para no primeiro
 * ancestral cujo subárvore contenha um nó de texto próprio batendo com o padrão.
 */
function extrairLocalizacao(
  $: CheerioAPI,
  ancoraEl: Cheerio<AnyNode>,
): string | null {
  let el = ancoraEl;
  for (let nivel = 0; nivel < LOCALIZACAO_MAX_NIVEIS_ACIMA; nivel++) {
    const pai = el.parent();
    if (pai.length === 0) {
      return null;
    }
    const candidato = pai
      .find('*')
      .filter((_, node) => LOCALIZACAO_REGEX.test(textoProprio($, $(node))));
    if (candidato.length > 0) {
      return textoProprio($, candidato.first());
    }
    el = pai;
  }
  return null;
}

export function parseSitemapIndex($: CheerioAPI): string[] {
  const urls = new Set<string>();
  $('loc').each((_, el) => {
    const texto = $(el).text().trim();
    if (texto.endsWith('.xml')) {
      urls.add(texto);
    }
  });
  return [...urls];
}

export interface SitemapUrlEntry {
  url: string;
  lastmod: string | null;
}

export function parseSitemapUrls($: CheerioAPI): SitemapUrlEntry[] {
  const porUrl = new Map<string, string | null>();
  $('url').each((_, el) => {
    const loc = $(el).find('loc').first().text().trim();
    if (loc === '' || !new URL(loc).pathname.startsWith('/imovel/')) {
      return;
    }
    const lastmodTexto = $(el).find('lastmod').first().text().trim();
    porUrl.set(loc, lastmodTexto === '' ? null : lastmodTexto);
  });
  return [...porUrl].map(([url, lastmod]) => ({ url, lastmod }));
}

/**
 * Extrai um `RawListingItem` de uma página de detalhe já carregada em `$`. `null` quando
 * nem "Valor venda" nem "Valor aluguel" foram encontrados — item malformado, descartado
 * sem derrubar a fase (quem chama decide não lançar e seguir para o próximo request).
 */
export function parseListingDetailPage(
  $: CheerioAPI,
  url: string,
  origem: OrigemAnuncio,
): RawListingItem | null {
  const precoVendaEl = encontrarRotuloEl($, [...ROTULOS.PRECO_VENDA]);
  const precoAluguelEl = encontrarRotuloEl($, [...ROTULOS.PRECO_ALUGUEL]);

  let tipoTransacao: TipoTransacao;
  let preco: number;
  let precoLabelEl: Cheerio<AnyNode>;
  if (precoVendaEl !== null) {
    tipoTransacao = TipoTransacao.VENDA;
    preco = parseMoeda(valorDoRotulo(precoVendaEl, [...ROTULOS.PRECO_VENDA]));
    precoLabelEl = precoVendaEl;
  } else if (precoAluguelEl !== null) {
    tipoTransacao = TipoTransacao.ALUGUEL;
    preco = parseMoeda(
      valorDoRotulo(precoAluguelEl, [...ROTULOS.PRECO_ALUGUEL]),
    );
    precoLabelEl = precoAluguelEl;
  } else {
    return null;
  }

  const titulo = extrairTitulo($);
  if (titulo === null) {
    return null;
  }
  // Ancorado no rótulo de preço já encontrado acima — nunca busca no documento
  // inteiro (ver comentário de LOCALIZACAO_REGEX sobre o carrossel de imóveis
  // similares).
  const localizacao = extrairLocalizacao($, precoLabelEl);
  if (localizacao === null) {
    return null;
  }

  const item: RawListingItem = {
    origem,
    tipoTransacao,
    // Sem fonte confirmada nos 8 sites testados (achado do lote 3) — decidir seletor
    // candidato no smoke test ao vivo, não adivinhar aqui.
    tipoImovel: null,
    link: url,
    titulo,
    quartos: extrairNumero($, [...ROTULOS.QUARTOS]),
    banheiros: extrairNumero($, [...ROTULOS.BANHEIROS]),
    vagas: extrairNumero($, [...ROTULOS.VAGAS]),
    area: parseArea(extrairPorRotulo($, [...ROTULOS.AREA_TOTAL])),
    localizacao,
    dataDePublicacaoText: null,
    preco,
    iptu: parseMoeda(extrairPorRotulo($, [...ROTULOS.IPTU])),
    condominio: parseMoeda(extrairPorRotulo($, [...ROTULOS.CONDOMINIO])),
    precoAntigo: null,
  };

  if (!temValorPlausivel(item)) {
    return null;
  }

  return item;
}
