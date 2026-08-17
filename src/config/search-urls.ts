import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { OrigemAnuncio } from '../persistence/enums/origem-anuncio.enum.js';
import { TipoTransacao } from '../persistence/enums/tipo-transacao.enum.js';

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

const TIPOS_TRANSACAO_VALIDOS = new Set<string>(Object.values(TipoTransacao));

export interface SearchUrlEntry {
  url: string;
  transactionType: TipoTransacao;
}

interface RawSearchUrlEntry {
  url: string;
  transactionType: string;
}

type SearchUrlsFile = Record<string, RawSearchUrlEntry[]>;

export async function loadStartUrls(
  fonte: OrigemAnuncio,
): Promise<SearchUrlEntry[]> {
  const raw = await readFile(SEARCH_URLS_PATH, 'utf-8');
  const config = JSON.parse(raw) as SearchUrlsFile;

  const chave = SEARCH_URLS_KEY[fonte];
  const entries = config[chave];

  if (entries === undefined || entries.length === 0) {
    throw new Error(
      `search-urls.json não tem URLs de busca para a fonte "${chave}"`,
    );
  }

  return entries.map((entry) => {
    if (!TIPOS_TRANSACAO_VALIDOS.has(entry.transactionType)) {
      throw new Error(
        `search-urls.json: transactionType inválido "${entry.transactionType}" para a fonte "${chave}"`,
      );
    }
    return {
      url: entry.url,
      transactionType: entry.transactionType as TipoTransacao,
    };
  });
}
