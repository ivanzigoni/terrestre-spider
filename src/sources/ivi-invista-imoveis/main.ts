import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { createImoviewBrowserRun } from '../shared/imoview-browser-main.js';

// Precisa do prefixo `www.`: a home sem `www` responde 410 (redireciona só via
// navegador), confirmado em `discovery/independentes-diagnostico.md`.
const BASE_URL = 'https://www.invistaimoveismg.com.br';

// Via navegador (não a variante HTTP direta): mesma assinatura de bloqueio do Liderar
// (`{"error":true,"log":"Curl failed...500...","redirect":".../manutencao"}` em qualquer
// cliente HTTP), reteste confirmado via navegação real em
// `.claude/__workdir/integracao-lote/lotes.md` (lote 1).
export const runIviInvistaImoveis = createImoviewBrowserRun(
  BASE_URL,
  OrigemAnuncio.IVI_INVISTA_IMOVEIS,
  'IVI Invista Imóveis',
);

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runIviInvistaImoveis();
}
