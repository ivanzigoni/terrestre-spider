import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { OrigemAnuncio } from '../persistence/enums/origem-anuncio.enum.js';
import { TipoTransacao } from '../persistence/enums/tipo-transacao.enum.js';

const currentDirPath = path.dirname(fileURLToPath(import.meta.url));
const SEARCH_URLS_PATH = path.join(currentDirPath, 'search-urls.json');

// Mapeia o valor do enum (usado para gravar `origem` no banco) para a chave
// correspondente em search-urls.json (usada nas URLs de busca do app antigo).
// Partial (não Record completo): fontes do cluster Imoview não têm URL de busca em
// HTML — resolvem cidade dinamicamente via API (src/sources/shared/imoview-client.ts)
// e nunca chamam loadStartUrls.
const SEARCH_URLS_KEY: Partial<Record<OrigemAnuncio, string>> = {
  [OrigemAnuncio.OLX]: 'olx',
  [OrigemAnuncio.NETIMOVEIS]: 'netimoveis',
  [OrigemAnuncio.VIVA_REAL]: 'viva-real',
  [OrigemAnuncio.ZAP_IMOVEIS]: 'zap-imoveis',
  [OrigemAnuncio.QUINTO_ANDAR]: 'quinto-andar',
  [OrigemAnuncio.IMOVELWEB]: 'imovelweb',
};

const TIPOS_TRANSACAO_VALIDOS = new Set<string>(Object.values(TipoTransacao));

export interface SearchUrlEntry {
  url: string;
  tipoTransacao: TipoTransacao;
}

interface RawSearchUrlEntry {
  url: string;
  tipoTransacao: string;
}

type SearchUrlsFile = Record<string, RawSearchUrlEntry[]>;

export async function loadStartUrls(
  fonte: OrigemAnuncio,
): Promise<SearchUrlEntry[]> {
  const raw = await readFile(SEARCH_URLS_PATH, 'utf-8');
  const config = JSON.parse(raw) as SearchUrlsFile;

  const chave = SEARCH_URLS_KEY[fonte];
  if (chave === undefined) {
    throw new Error(
      `loadStartUrls: fonte "${fonte}" não usa search-urls.json (fonte baseada em API, sem URLs de busca HTML)`,
    );
  }

  const entries = config[chave];
  if (entries === undefined || entries.length === 0) {
    throw new Error(
      `search-urls.json não tem URLs de busca para a fonte "${chave}"`,
    );
  }

  return entries.map((entry) => {
    if (!TIPOS_TRANSACAO_VALIDOS.has(entry.tipoTransacao)) {
      throw new Error(
        `search-urls.json: tipoTransacao inválido "${entry.tipoTransacao}" para a fonte "${chave}"`,
      );
    }
    return {
      url: entry.url,
      tipoTransacao: entry.tipoTransacao as TipoTransacao,
    };
  });
}
