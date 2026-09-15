import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';

import type { AnuncioNormalizado, Parser } from '../anuncio-normalizado.js';
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

function extractLocalizacao($: CheerioAPI): LocalizacaoEmpreendimento {
  const texto = $('p.text-lg.text-tertiary-400').first().text().trim();
  const [bairroParte, restante] = texto.split(',');
  if (bairroParte === undefined || restante === undefined) {
    return { bairro: null, cidade: null, estado: null };
  }

  const [cidadeParte, estadoParte] = restante.split('-');
  if (cidadeParte === undefined || estadoParte === undefined) {
    return { bairro: nonEmptyOrNull(bairroParte), cidade: null, estado: null };
  }

  return {
    bairro: nonEmptyOrNull(bairroParte),
    cidade: nonEmptyOrNull(cidadeParte),
    estado: nonEmptyOrNull(estadoParte),
  };
}

export const parseMyBroker: Parser = (conteudo: string): AnuncioNormalizado => {
  const $ = load(conteudo);

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
    anuncianteNome: null,
    codigoCreci: null,
    publicadoEm: null,
    atualizadoEm: null,
  };
};
