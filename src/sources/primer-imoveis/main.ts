import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { createLoftSitesRun } from '../shared/loft-sites-main.js';

const BASE_URL = 'https://grupoprimerimoveis.com.br';

export const runPrimerImoveis = createLoftSitesRun(
  BASE_URL,
  OrigemAnuncio.PRIMER_IMOVEIS,
  'Primer Imóveis',
);

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runPrimerImoveis();
}
