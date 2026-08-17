export type SiteCategoria = 'portal' | 'imobiliaria' | 'leilao' | 'temporada';

export interface DiscoverySite {
  nome: string;
  url: string | null;
  categoria: SiteCategoria;
}

export interface NetworkRequestSample {
  method: string;
  url: string;
  resourceType: string;
}

export interface StructuredDataSignals {
  hasNextData: boolean;
  nextDataSample: string | null;
  jsonLdCount: number;
  jsonLdSample: string | null;
  hasInitialState: boolean;
}

export interface BlockingSignals {
  blocked: boolean;
  matchedPattern: string | null;
}

export interface PaginationSignals {
  hasNumberedPagination: boolean;
  hasNextLink: boolean;
}

export interface RobotsInfo {
  fetched: boolean;
  status: number | null;
  disallowedForTargetPath: boolean | null;
  contentSample: string | null;
}

export interface ProbeResult {
  nome: string;
  urlSolicitada: string;
  urlFinal: string | null;
  httpStatus: number | null;
  robots: RobotsInfo;
  estruturaDados: StructuredDataSignals | null;
  bloqueio: BlockingSignals | null;
  paginacao: PaginationSignals | null;
  requisicoesRede: NetworkRequestSample[];
  consoleErros: string[];
  titulo: string | null;
  bodyTextSample: string | null;
  screenshotPath: string | null;
  erro: string | null;
  timestamp: string;
}
