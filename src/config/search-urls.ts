import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { OrigemAnuncio } from '../persistence/enums/origem-anuncio.enum.js';

const currentDirPath = path.dirname(fileURLToPath(import.meta.url));
const SEARCH_URLS_PATH = path.join(currentDirPath, 'search-urls.json');

// Mapeia o valor do enum (usado para gravar `origin` no banco) para a chave
// correspondente em search-urls.json (usada nas URLs de busca do app antigo).
const SEARCH_URLS_KEY: Record<OrigemAnuncio, string> = {
  [OrigemAnuncio.OLX]: 'olx',
  [OrigemAnuncio.NETIMOVEIS]: 'netimoveis',
  [OrigemAnuncio.VIVA_REAL]: 'viva-real',
  [OrigemAnuncio.ZAP_IMOVEIS]: 'zap-imoveis',
};

type SearchUrlsFile = Record<string, string[]>;

export async function loadStartUrls(fonte: OrigemAnuncio): Promise<string[]> {
  const raw = await readFile(SEARCH_URLS_PATH, 'utf-8');
  const config = JSON.parse(raw) as SearchUrlsFile;

  const chave = SEARCH_URLS_KEY[fonte];
  const urls = config[chave];

  if (urls === undefined || urls.length === 0) {
    throw new Error(
      `search-urls.json não tem URLs de busca para a fonte "${chave}"`,
    );
  }

  return urls;
}
