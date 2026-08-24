import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { createKenloRun } from '../shared/kenlo-main.js';

const BASE_URL = 'https://www.jmcimoveisbh.com.br';

export const runJmcImoveis = createKenloRun(
  BASE_URL,
  OrigemAnuncio.JMC_IMOVEIS,
  'JMC Imóveis',
);

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runJmcImoveis();
}
