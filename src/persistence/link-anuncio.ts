import type { Dictionary } from 'crawlee';

import type { TipoTransacao } from './enums/tipo-transacao.enum.js';

/**
 * Formato gravado no Dataset do Crawlee por cada raspador, na fase de listagem — só o
 * link do anúncio e o tipo de transação da busca que o descobriu, o mínimo necessário
 * para enfileirar a fase de detalhe (ver `*-main.ts` de cada fonte). Nenhum outro campo
 * do anúncio é extraído aqui: a pipeline não estrutura dado de anúncio, só captura o
 * conteúdo bruto (ver `raw-capture-item.ts`) e controla o próprio crawl.
 */
export interface LinkAnuncio extends Dictionary {
  link: string;
  tipoTransacao: TipoTransacao;
}
