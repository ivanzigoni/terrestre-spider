import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { createLoftSitesRun } from '../shared/loft-sites-main.js';

const BASE_URL = 'https://topmig.com.br';

export const runTopmigImoveis = createLoftSitesRun(
  BASE_URL,
  OrigemAnuncio.TOPMIG_IMOVEIS,
  'TOPMIG Imóveis',
);

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runTopmigImoveis();
}
