import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { createImoviewBrowserRun } from '../shared/imoview-browser-main.js';

const BASE_URL = 'https://www.liderarimoveis.com.br';

// Via navegador (não a variante HTTP direta): o endpoint de busca do Liderar rejeita
// cliente HTTP mesmo com fingerprint de navegador imitado — só Playwright real passa,
// confirmado em discovery/imoview-diagnostico.md.
export const runLiderarImoveis = createImoviewBrowserRun(
  BASE_URL,
  OrigemAnuncio.LIDERAR_IMOVEIS,
  'Liderar Imóveis',
);

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runLiderarImoveis();
}
