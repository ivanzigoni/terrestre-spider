import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { createLoftSitesRun } from '../shared/loft-sites-main.js';

const BASE_URL = 'https://realimoveisbh.com.br';

export const runRealImoveisPampulha = createLoftSitesRun(
  BASE_URL,
  OrigemAnuncio.REAL_IMOVEIS_PAMPULHA,
  'Real Imóveis Pampulha',
);

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runRealImoveisPampulha();
}
