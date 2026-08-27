import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { createKenloRun } from '../shared/kenlo-main.js';

const BASE_URL = 'https://www.luxusimoveis.com.br';

export const runLuxusImoveisPremium = createKenloRun(
  BASE_URL,
  OrigemAnuncio.LUXUS_IMOVEIS_PREMIUM,
  'Luxus Imóveis Premium',
);

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runLuxusImoveisPremium();
}
