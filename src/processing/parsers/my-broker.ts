import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';

import type { AnuncioNormalizado, Parser } from '../anuncio-normalizado.js';
import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import { parseMoneyToCents } from './shared/money.js';

function nonEmptyOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().normalize('NFC');
  return trimmed === '' ? null : trimmed;
}

function extractCodigoExterno($: CheerioAPI): string {
  const match = /Código do imóvel:\s*#?(\d+)/i.exec($('body').text());
  const codigo = match?.[1];
  if (codigo === undefined) {
    throw new Error(
      'MyBroker: texto "Código do imóvel: #..." não encontrado no HTML',
    );
  }
  return codigo;
}

function extractSobreImovelTexto($: CheerioAPI): string | null {
  const heading = $('h2')
    .filter((_index, el) => $(el).text().trim() === 'Sobre o imóvel')
    .first();
  if (heading.length === 0) return null;

  const paragrafo = heading.closest('section').find('p').first();
  paragrafo.find('br').replaceWith('\n');
  return nonEmptyOrNull(paragrafo.text());
}

interface LocalizacaoEmpreendimento {
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
}

// A localização não vem de um parágrafo com classe própria: no layout de empreendimento
// (fixture __detalhe.html), "text-lg.text-tertiary-400" casa com o parágrafo de
// localização; no layout de imóvel individual (fixture
// __detalhe-imovel-individual.html), essa mesma classe casa primeiro com o rótulo de
// preço ("Valor do imóvel"), e o parágrafo de localização daquele imóvel específico é
// indistinguível, por classe, dos parágrafos de bairro dos cards de "imóveis
// semelhantes" mais abaixo na página. O meta "description" (SEO, sempre presente, gerado
// pelo backend a partir do mesmo texto em ambos os layouts, sempre no formato "... no
// bairro {bairro} em {cidade}, {estado}: ...") é o único texto da página com
// bairro/cidade/estado específicos deste imóvel de forma inequívoca.
const PREFIXO_LOCALIZACAO = 'no bairro ';
const SEPARADOR_CIDADE = ' em ';

function extractLocalizacao($: CheerioAPI): LocalizacaoEmpreendimento {
  const descricaoMeta = $('meta[name="description"]').attr('content') ?? '';
  const indiceInicio = descricaoMeta.toLowerCase().indexOf(PREFIXO_LOCALIZACAO);
  if (indiceInicio === -1) return { bairro: null, cidade: null, estado: null };

  const inicioTrecho = indiceInicio + PREFIXO_LOCALIZACAO.length;
  const fimTrecho = descricaoMeta.indexOf(':', inicioTrecho);
  const trecho = (
    fimTrecho === -1
      ? descricaoMeta.slice(inicioTrecho)
      : descricaoMeta.slice(inicioTrecho, fimTrecho)
  ).trim();

  const indiceCidade = trecho.indexOf(SEPARADOR_CIDADE);
  if (indiceCidade === -1) {
    return { bairro: nonEmptyOrNull(trecho), cidade: null, estado: null };
  }

  const bairroParte = trecho.slice(0, indiceCidade);
  const restante = trecho.slice(indiceCidade + SEPARADOR_CIDADE.length);
  const indiceVirgula = restante.lastIndexOf(',');
  if (indiceVirgula === -1) {
    return {
      bairro: nonEmptyOrNull(bairroParte),
      cidade: nonEmptyOrNull(restante),
      estado: null,
    };
  }

  return {
    bairro: nonEmptyOrNull(bairroParte),
    cidade: nonEmptyOrNull(restante.slice(0, indiceVirgula)),
    estado: nonEmptyOrNull(restante.slice(indiceVirgula + 1)),
  };
}

export const parseMyBroker: Parser = (
  conteudo: string,
  contexto,
): AnuncioNormalizado => {
  const $ = load(conteudo);
  const tipoTransacao = contexto?.tipoTransacao ?? null;

  const codigoExterno = extractCodigoExterno($);
  const sobreImovelTexto = extractSobreImovelTexto($);
  const { bairro, cidade, estado } = extractLocalizacao($);

  const condominioMatch =
    sobreImovelTexto === null
      ? null
      : /Condom[íi]nio:\s*([^\n]+)/i.exec(sobreImovelTexto);
  const iptuMatch =
    sobreImovelTexto === null
      ? null
      : /IPTU:\s*([^\n]+)/i.exec(sobreImovelTexto);

  return {
    codigoExterno,
    // Fixture de amostra é um "lançamento" (empreendimento com tabela de tipologias e
    // preços plurais por unidade), não uma unidade individual à venda/aluguel — por isso
    // este parser cobre apenas o nível do empreendimento e não calcula um preço/área/
    // contagem de cômodos único a partir da tabela. Coberto por
    // my-broker.test.ts::'documenta a limitação de nível de empreendimento'.
    precoVenda: null,
    precoAluguel: null,
    disponivelAluguel:
      tipoTransacao === null ? null : tipoTransacao === TipoTransacao.ALUGUEL,
    disponivelVenda:
      tipoTransacao === null ? null : tipoTransacao === TipoTransacao.VENDA,
    condominio:
      condominioMatch?.[1] !== undefined
        ? parseMoneyToCents(condominioMatch[1])
        : null,
    iptu: iptuMatch?.[1] !== undefined ? parseMoneyToCents(iptuMatch[1]) : null,
    area: null,
    quartos: null,
    suites: null,
    banheiros: null,
    vagas: null,
    tipoImovelBruto: null,
    bairro,
    cidade,
    estado,
    cep: null,
    endereco: null,
    numero: null,
    latitude: null,
    longitude: null,
    descricao: sobreImovelTexto,
    imagemUrl: nonEmptyOrNull($('meta[property="og:image"]').attr('content')),
    anuncianteNome: null,
    codigoCreci: null,
    publicadoEm: null,
    atualizadoEm: null,
  };
};
