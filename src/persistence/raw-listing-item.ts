import type { Dictionary } from 'crawlee';

import type { OrigemAnuncio } from './enums/origem-anuncio.enum.js';
import type { TipoTransacao } from './enums/tipo-transacao.enum.js';

/**
 * Formato gravado no Dataset do Crawlee por cada raspador, na fase Extract.
 * `precoTotal` não faz parte deste tipo — é calculado uma única vez, na fase Load.
 */
export interface RawListingItem extends Dictionary {
  origem: OrigemAnuncio;
  tipoTransacao: TipoTransacao;
  tipoImovel: string | null;
  link: string;
  titulo: string;
  quartos: number;
  banheiros: number;
  vagas: number | null;
  area: number;
  localizacao: string;
  dataDePublicacaoText: string | null;
  preco: number;
  iptu: number;
  condominio: number;
  precoAntigo: number | null;
}
