import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { createImoviewRun } from '../shared/imoview-main.js';

const BASE_URL = 'https://www.imobiliariaburitis.com.br';

export const runImobiliariaBuritis = createImoviewRun(
  BASE_URL,
  OrigemAnuncio.IMOBILIARIA_BURITIS,
  'Imobiliária Buritis',
);

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runImobiliariaBuritis();
}
