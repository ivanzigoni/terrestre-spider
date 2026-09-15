import type { Parser } from '../anuncio-normalizado.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { parseCasaMineira } from './casa-mineira.js';
import { parseChaveCerta } from './chave-certa.js';
import { parseGsaAtivos } from './gsa-ativos.js';
import { parseImobiBrasil } from './imobibrasil.js';
import { parseImobiliariaPampulha } from './imobiliaria-pampulha.js';
import { parseImovelweb } from './imovelweb.js';
import { parseImoview } from './imoview.js';
import { parseKenlo } from './kenlo.js';
import { parseLoftSites } from './loft-sites.js';
import { parseMyBroker } from './my-broker.js';
import { parseNetimoveis } from './netimoveis.js';
import { parseOlx } from './olx.js';
import { parseQuintoAndar } from './quinto-andar.js';
import { parseStiloNetimoveis } from './stilo-netimoveis.js';
import { parseVivaReal, parseZapImoveis } from './grupo-zap.js';

const parsers: Record<OrigemAnuncio, Parser> = {
  [OrigemAnuncio.OLX]: parseOlx,
  [OrigemAnuncio.VIVA_REAL]: parseVivaReal,
  [OrigemAnuncio.ZAP_IMOVEIS]: parseZapImoveis,
  [OrigemAnuncio.NETIMOVEIS]: parseNetimoveis,
  [OrigemAnuncio.QUINTO_ANDAR]: parseQuintoAndar,
  [OrigemAnuncio.IMOVELWEB]: parseImovelweb,
  [OrigemAnuncio.CASA_MINEIRA]: parseCasaMineira,
  [OrigemAnuncio.GSA_ATIVOS]: parseGsaAtivos,
  [OrigemAnuncio.IMOBILIARIA_PAMPULHA]: parseImobiliariaPampulha,
  [OrigemAnuncio.CHAVE_CERTA_IMOVEIS_BH]: parseChaveCerta,
  [OrigemAnuncio.STILO_NETIMOVEIS]: parseStiloNetimoveis,
  [OrigemAnuncio.MY_BROKER_BELO_HORIZONTE]: parseMyBroker,
  [OrigemAnuncio.IMOBILIARIA_BURITIS]: parseImoview,
  [OrigemAnuncio.IVI_INVISTA_IMOVEIS]: parseImoview,
  [OrigemAnuncio.DIEGO_GARCIA_IMOVEIS]: parseImoview,
  [OrigemAnuncio.ADIMOVEIS_BH]: parseImoview,
  [OrigemAnuncio.CASA_GRANDE_IMOVEIS]: parseImoview,
  [OrigemAnuncio.LIDERAR_IMOVEIS]: parseImoview,
  [OrigemAnuncio.VALORE_IMOVEIS]: parseImoview,
  [OrigemAnuncio.REAL_IMOBILIARIA]: parseImoview,
  [OrigemAnuncio.CASA_PAMPULHA_IMOVEIS]: parseLoftSites,
  [OrigemAnuncio.HABITAR_PAMPULHA]: parseLoftSites,
  [OrigemAnuncio.MODELO_IMOVEL]: parseLoftSites,
  [OrigemAnuncio.PRIMER_IMOVEIS]: parseLoftSites,
  [OrigemAnuncio.REAL_IMOVEIS_PAMPULHA]: parseLoftSites,
  [OrigemAnuncio.SEVEN_IMOVEIS]: parseLoftSites,
  [OrigemAnuncio.TOPMIG_IMOVEIS]: parseLoftSites,
  [OrigemAnuncio.VENDA_NOVA_IMOVEIS]: parseLoftSites,
  [OrigemAnuncio.JMC_IMOVEIS]: parseKenlo,
  [OrigemAnuncio.LUXUS_IMOVEIS_PREMIUM]: parseKenlo,
  [OrigemAnuncio.LIMA_IMOVEIS_BARREIRO]: parseImobiBrasil,
  [OrigemAnuncio.STRUTURAL_IMOBILIARIA]: parseImobiBrasil,
};

export function getParser(origem: OrigemAnuncio): Parser {
  return parsers[origem];
}
