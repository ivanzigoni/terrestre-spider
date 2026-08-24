import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { createLoftSitesRun } from '../shared/loft-sites-main.js';

const BASE_URL = 'https://sevenimoveis.com.br';

export const runSevenImoveis = createLoftSitesRun(
  BASE_URL,
  OrigemAnuncio.SEVEN_IMOVEIS,
  'Seven Imóveis',
);

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runSevenImoveis();
}
