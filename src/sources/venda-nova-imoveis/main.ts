import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { createLoftSitesRun } from '../shared/loft-sites-main.js';

const BASE_URL = 'https://vendanovaimoveis.com.br';

export const runVendaNovaImoveis = createLoftSitesRun(
  BASE_URL,
  OrigemAnuncio.VENDA_NOVA_IMOVEIS,
  'Venda Nova Imóveis',
);

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runVendaNovaImoveis();
}
