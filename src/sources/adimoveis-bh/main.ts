import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { createImoviewRun } from '../shared/imoview-main.js';

const BASE_URL = 'https://www.adimoveisbh.com.br';

export const runAdimoveisBh = createImoviewRun(
  BASE_URL,
  OrigemAnuncio.ADIMOVEIS_BH,
  'AdimóveisBH',
);

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runAdimoveisBh();
}
