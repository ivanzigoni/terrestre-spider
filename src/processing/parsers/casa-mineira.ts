import type { Parser } from '../anuncio-normalizado.js';
import { parseImovelwebTemplate } from './imovelweb.js';

export const parseCasaMineira: Parser = (conteudo: string) =>
  parseImovelwebTemplate(conteudo, 'CasaMineira');
