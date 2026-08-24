import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { createLoftSitesRun } from '../shared/loft-sites-main.js';

const BASE_URL = 'https://casapampulhaimoveis.com.br';

export const runCasaPampulhaImoveis = createLoftSitesRun(
  BASE_URL,
  OrigemAnuncio.CASA_PAMPULHA_IMOVEIS,
  'Casa Pampulha Imóveis',
);

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runCasaPampulhaImoveis();
}
