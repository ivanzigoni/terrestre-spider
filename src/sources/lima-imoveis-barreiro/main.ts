import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { createImobiBrasilRun } from '../shared/imobibrasil-main.js';

const BASE_URL = 'https://www.limaimoveisbarreiro.com.br';

export const runLimaImoveisBarreiro = createImobiBrasilRun(
  BASE_URL,
  OrigemAnuncio.LIMA_IMOVEIS_BARREIRO,
  'Lima Imóveis Barreiro',
);

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runLimaImoveisBarreiro();
}
