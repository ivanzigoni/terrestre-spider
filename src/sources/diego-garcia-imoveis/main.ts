import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { createImoviewBrowserRun } from '../shared/imoview-browser-main.js';

const BASE_URL = 'https://www.diegogarciaimoveis.com.br';

// Via navegador (não a variante HTTP direta): mesma assinatura de bloqueio do Liderar
// (`{"error":true,"log":"Curl failed...500...","redirect":".../manutencao"}` em qualquer
// cliente HTTP), reteste confirmado via navegação real em
// `.claude/__workdir/integracao-lote/lotes.md` (lote 1).
export const runDiegoGarciaImoveis = createImoviewBrowserRun(
  BASE_URL,
  OrigemAnuncio.DIEGO_GARCIA_IMOVEIS,
  'Diego Garcia Imóveis',
);

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runDiegoGarciaImoveis();
}
