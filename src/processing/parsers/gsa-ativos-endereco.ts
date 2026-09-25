import { aparar, normalizarEspacos } from './shared/texto.js';

export interface EnderecoGsa {
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
}

const CIDADE_BELO_HORIZONTE = 'Belo Horizonte';
const ESTADO_MINAS_GERAIS = 'MG';
const PADRAO_CEP = /\b(\d{2})\.?(\d{3})-(\d{3})\b/;
const PADRAO_ROTULO_CEP = /\bCEP\b/gi;
const PADRAO_NUMERO = /^\d[\d.]*[a-z]?$/i;
const SEPARADOR_TRAVESSAO = ' - ';
const PREFIXOS_LOGRADOURO = new Set([
  'r',
  'rua',
  'av',
  'avenida',
  'rod',
  'rodovia',
  'al',
  'alameda',
  'praça',
  'praca',
  'travessa',
  'estrada',
  'beco',
  'via',
]);
const PREFIXOS_NUMERO = new Set(['no', 'nº', 'n°']);
const CONECTORES = new Set(['de', 'da', 'do', 'das', 'dos']);
const NOMES_ESTADO = new Set(['mg', 'minas gerais']);
const NOMES_CIDADE = ['belo horizonte', 'bh'];

function extractCep(texto: string): string | null {
  const match = PADRAO_CEP.exec(texto);
  if (match === null) return null;
  const [, prefixo, meio, sufixo] = match;
  return `${prefixo ?? ''}${meio ?? ''}-${sufixo ?? ''}`;
}

function ehNumero(token: string): boolean {
  return PADRAO_NUMERO.test(aparar(token));
}

function ehLogradouro(segmento: string): boolean {
  const primeiroToken = segmento.split(' ')[0] ?? '';
  const prefixo = (primeiroToken.split('.')[0] ?? '').toLowerCase();
  return PREFIXOS_LOGRADOURO.has(prefixo);
}

interface NumeroExtraido {
  numero: string | null;
  resto: readonly string[];
}

function extrairNumeroInicial(tokens: readonly string[]): NumeroExtraido {
  const primeiro = tokens[0];
  if (primeiro === undefined) return { numero: null, resto: tokens };

  const segundo = tokens[1];
  if (
    PREFIXOS_NUMERO.has(aparar(primeiro).toLowerCase()) &&
    segundo !== undefined &&
    ehNumero(segundo)
  ) {
    return { numero: aparar(segundo), resto: tokens.slice(2) };
  }
  if (ehNumero(primeiro)) {
    return { numero: aparar(primeiro), resto: tokens.slice(1) };
  }
  return { numero: null, resto: tokens };
}

function removerPrefixoBairro(tokens: readonly string[]): readonly string[] {
  if ((tokens[0] ?? '').toLowerCase() !== 'bairro') return tokens;
  const semPrefixo = tokens.slice(1);
  return CONECTORES.has((semPrefixo[0] ?? '').toLowerCase())
    ? semPrefixo.slice(1)
    : semPrefixo;
}

interface LogradouroSeparado {
  rua: string;
  numero: string | null;
  sobra: string | null;
}

function separarLogradouro(
  segmento: string,
  haNumeroEmOutroSegmento: boolean,
): LogradouroSeparado {
  const tokens = segmento.split(' ');
  for (let indice = 1; indice < tokens.length; indice++) {
    const candidato = extrairNumeroInicial(tokens.slice(indice));
    if (candidato.numero === null) continue;

    const sobra = candidato.resto.join(' ');
    const primeiroDaSobra = (candidato.resto[0] ?? '').toLowerCase();
    const numeroEhUltimo = sobra === '';
    const sobraComecaComConector = CONECTORES.has(primeiroDaSobra);
    if (
      numeroEhUltimo ||
      (!haNumeroEmOutroSegmento && !sobraComecaComConector)
    ) {
      return {
        rua: tokens.slice(0, indice).join(' '),
        numero: candidato.numero,
        sobra: numeroEhUltimo ? null : sobra,
      };
    }
    break;
  }
  return { rua: segmento, numero: null, sobra: null };
}

interface CidadeRemovida {
  restante: string;
  temUf: boolean;
}

function removerCidadeBeloHorizonte(segmento: string): CidadeRemovida | null {
  let texto = segmento;
  let temUf = false;
  const minusculo = texto.toLowerCase();
  if (minusculo.endsWith('/mg') || minusculo.endsWith(' mg')) {
    texto = texto.slice(0, -'/mg'.length);
    temUf = true;
  }
  texto = aparar(texto);

  const semCaixa = texto.toLowerCase();
  for (const nome of NOMES_CIDADE) {
    if (semCaixa === nome) return { restante: '', temUf };
    if (semCaixa.endsWith(` ${nome}`)) {
      return {
        restante: aparar(texto.slice(0, texto.length - nome.length)),
        temUf,
      };
    }
  }
  return null;
}

function dividirSegmentos(texto: string): string[] {
  const semCep = texto.replace(PADRAO_CEP, ' ').replace(PADRAO_ROTULO_CEP, ' ');
  const comHifen = normalizarEspacos(semCep).split('–').join('-');
  return comHifen
    .split(',')
    .flatMap((parte) => parte.split(SEPARADOR_TRAVESSAO))
    .map((parte) => aparar(normalizarEspacos(parte)))
    .filter((parte) => parte !== '');
}

interface Localizacao {
  restantes: string[];
  cidade: string | null;
  estado: string | null;
}

function separarCidadeEEstado(segmentos: readonly string[]): Localizacao {
  let cidade: string | null = null;
  let estado: string | null = null;
  const restantes: string[] = [];

  for (const [indice, segmento] of segmentos.entries()) {
    if (NOMES_ESTADO.has(segmento.toLowerCase())) {
      estado = ESTADO_MINAS_GERAIS;
      continue;
    }
    if (indice === 0 && ehLogradouro(segmento)) {
      restantes.push(segmento);
      continue;
    }
    const semCidade = removerCidadeBeloHorizonte(segmento);
    if (semCidade === null) {
      restantes.push(segmento);
      continue;
    }
    cidade = CIDADE_BELO_HORIZONTE;
    if (semCidade.temUf) estado = ESTADO_MINAS_GERAIS;
    if (semCidade.restante !== '') restantes.push(semCidade.restante);
  }
  return { restantes, cidade, estado };
}

export function parseEnderecoGsa(texto: string): EnderecoGsa {
  const {
    restantes,
    cidade: cidadeBh,
    estado,
  } = separarCidadeEEstado(dividirSegmentos(texto));

  let endereco: string | null = null;
  let numero: string | null = null;
  let resto: readonly string[] = restantes;
  const primeiro = restantes[0];
  if (primeiro !== undefined && ehLogradouro(primeiro)) {
    const outros = restantes.slice(1);
    const haNumeroEmOutroSegmento = outros.some(
      (segmento) => extrairNumeroInicial(segmento.split(' ')).numero !== null,
    );
    const separado = separarLogradouro(primeiro, haNumeroEmOutroSegmento);
    endereco = separado.rua === '' ? null : separado.rua;
    numero = separado.numero;
    resto = separado.sobra === null ? outros : [separado.sobra, ...outros];
  }

  const candidatosBairro: string[] = [];
  for (const segmento of resto) {
    const extraido = extrairNumeroInicial(segmento.split(' '));
    numero ??= extraido.numero;
    const candidato = removerPrefixoBairro(extraido.resto).join(' ');
    if (candidato !== '') candidatosBairro.push(candidato);
  }

  const cidade = cidadeBh ?? candidatosBairro[1] ?? null;
  return {
    endereco: endereco?.normalize('NFC') ?? null,
    numero,
    bairro: candidatosBairro[0]?.normalize('NFC') ?? null,
    cidade: cidade?.normalize('NFC') ?? null,
    estado,
    cep: extractCep(texto),
  };
}
