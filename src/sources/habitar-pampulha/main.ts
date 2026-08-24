import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { createLoftSitesRun } from '../shared/loft-sites-main.js';

const BASE_URL = 'https://habitarpampulha.com.br';

export const runHabitarPampulha = createLoftSitesRun(
  BASE_URL,
  OrigemAnuncio.HABITAR_PAMPULHA,
  'Habitar Pampulha',
);

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runHabitarPampulha();
}
