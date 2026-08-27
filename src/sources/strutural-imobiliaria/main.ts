import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { createImobiBrasilRun } from '../shared/imobibrasil-main.js';

const BASE_URL = 'https://www.struturalimoveis.com.br';

export const runStruturalImobiliaria = createImobiBrasilRun(
  BASE_URL,
  OrigemAnuncio.STRUTURAL_IMOBILIARIA,
  'Strutural Imobiliária',
);

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runStruturalImobiliaria();
}
