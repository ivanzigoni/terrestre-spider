import type { Dictionary } from 'crawlee';

import type { FormatoCaptura } from './enums/formato-captura.enum.js';
import type { OrigemAnuncio } from './enums/origem-anuncio.enum.js';
import type { TipoPaginaCaptura } from './enums/tipo-pagina-captura.enum.js';
import type { TipoTransacao } from './enums/tipo-transacao.enum.js';

/**
 * Formato gravado no Dataset de captura bruta por cada router, uma vez por página
 * processada — seja página de LISTAGEM (uma por página de busca, N cards dentro) ou de
 * DETALHE (uma por anúncio individual visitado). `capturadoEm` é string ISO 8601, não
 * `Date` — o Dataset do Crawlee persiste como JSON no disco local, e um `Date` vira
 * string na escrita sem revive automático na leitura.
 */
export interface RawCaptureItem extends Dictionary {
  origem: OrigemAnuncio;
  tipoTransacao: TipoTransacao | null;
  tipoPagina: TipoPaginaCaptura;
  url: string;
  formato: FormatoCaptura;
  conteudo: string;
  capturadoEm: string;
}
