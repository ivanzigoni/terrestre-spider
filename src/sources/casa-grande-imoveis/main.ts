import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { createImoviewRun } from '../shared/imoview-main.js';

const BASE_URL = 'https://www.admcasagrande.com.br';

export const runCasaGrandeImoveis = createImoviewRun(
  BASE_URL,
  OrigemAnuncio.CASA_GRANDE_IMOVEIS,
  'Casa Grande Imóveis',
);

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runCasaGrandeImoveis();
}
