import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { createImoviewBrowserRun } from '../shared/imoview-browser-main.js';

const BASE_URL = 'https://www.realimobiliaria.com.br';

// Via navegador (não a variante HTTP direta): mesmo bloqueio de cliente HTTP do Liderar
// (HTTP 500 seco em qualquer chamada direta), reteste confirmado via navegação real em
// `.claude/__workdir/integracao-lote/lotes.md` (lote 1).
export const runRealImobiliaria = createImoviewBrowserRun(
  BASE_URL,
  OrigemAnuncio.REAL_IMOBILIARIA,
  'Real Imobiliária',
);

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runRealImobiliaria();
}
