import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { createLoftSitesRun } from '../shared/loft-sites-main.js';

const BASE_URL = 'https://modeloimovel.com.br';

export const runModeloImovel = createLoftSitesRun(
  BASE_URL,
  OrigemAnuncio.MODELO_IMOVEL,
  'Modelo Imóvel',
);

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runModeloImovel();
}
