import type { Page } from 'playwright';

import type {
  BlockingSignals,
  PaginationSignals,
  StructuredDataSignals,
} from './types.js';

const SAMPLE_LENGTH = 1000;

const BLOCK_PATTERNS: RegExp[] = [
  /access denied/i,
  /attention required/i,
  /just a moment/i,
  /are you (a )?human/i,
  /captcha/i,
  /checking your browser/i,
];

interface RawPageSignals {
  nextData: string | null;
  jsonLdSamples: string[];
  hasInitialState: boolean;
  title: string;
  bodyTextSample: string;
}

async function readRawPageSignals(page: Page): Promise<RawPageSignals> {
  return page.evaluate(() => {
    const nextDataEl = document.querySelector('script#__NEXT_DATA__');
    const jsonLdEls = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]'),
    );
    const win = window as unknown as Record<string, unknown>;

    return {
      nextData: nextDataEl?.textContent ?? null,
      jsonLdSamples: jsonLdEls.map((el) => el.textContent),
      hasInitialState: typeof win.__INITIAL_STATE__ !== 'undefined',
      title: document.title,
      bodyTextSample: document.body.innerText.slice(0, 1000),
    };
  });
}

export interface PageSignals {
  titulo: string;
  estruturaDados: StructuredDataSignals;
  bloqueio: BlockingSignals;
  bodyTextSample: string;
}

export async function extractPageSignals(page: Page): Promise<PageSignals> {
  const raw = await readRawPageSignals(page);

  const estruturaDados: StructuredDataSignals = {
    hasNextData: raw.nextData !== null,
    nextDataSample: raw.nextData?.slice(0, SAMPLE_LENGTH) ?? null,
    jsonLdCount: raw.jsonLdSamples.length,
    jsonLdSample: raw.jsonLdSamples[0]?.slice(0, SAMPLE_LENGTH) ?? null,
    hasInitialState: raw.hasInitialState,
  };

  const matchedPattern = BLOCK_PATTERNS.find(
    (pattern) => pattern.test(raw.title) || pattern.test(raw.bodyTextSample),
  );
  const bloqueio: BlockingSignals = {
    blocked: matchedPattern !== undefined,
    matchedPattern: matchedPattern?.source ?? null,
  };

  return {
    titulo: raw.title,
    estruturaDados,
    bloqueio,
    bodyTextSample: raw.bodyTextSample,
  };
}

export async function extractPaginationSignals(
  page: Page,
): Promise<PaginationSignals> {
  return page.evaluate(() => ({
    hasNumberedPagination:
      document.querySelector(
        '[class*="pagination" i], nav[aria-label*="page" i]',
      ) !== null,
    hasNextLink:
      document.querySelector(
        'a[rel="next"], a[aria-label*="próxima" i], a[aria-label*="next" i]',
      ) !== null,
  }));
}
