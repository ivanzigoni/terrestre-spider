import type { Dictionary } from 'crawlee';

import type { OrigemAnuncio } from './enums/origem-anuncio.enum.js';
import type { TipoTransacao } from './enums/tipo-transacao.enum.js';

/**
 * Formato gravado no Dataset do Crawlee por cada raspador, na fase Extract.
 * `totalPrice` não faz parte deste tipo — é calculado uma única vez, na fase Load.
 */
export interface RawListingItem extends Dictionary {
  origin: OrigemAnuncio;
  transactionType: TipoTransacao;
  propertyType: string | null;
  link: string;
  title: string;
  bedrooms: number;
  bathrooms: number;
  parkingSpots: number | null;
  area: number;
  location: string;
  datePostedText: string | null;
  price: number;
  iptu: number;
  condominio: number;
  oldPrice: number | null;
}
