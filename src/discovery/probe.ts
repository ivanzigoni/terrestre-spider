import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Browser, chromium } from 'playwright';

import { extractPageSignals, extractPaginationSignals } from './extract.js';
import { fetchRobots } from './robots.js';
import type {
  DiscoverySite,
  NetworkRequestSample,
  ProbeResult,
} from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITES_PATH = path.join(__dirname, 'sites.json');
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'discovery', 'output');
const SCREENSHOTS_DIR = path.join(OUTPUT_DIR, 'screenshots');

const NAVIGATION_TIMEOUT_MS = 30_000;
const NETWORK_IDLE_TIMEOUT_MS = 10_000;
const DELAY_BETWEEN_SITES_MS = 4_000;
const MAX_NETWORK_SAMPLES = 40;
const MAX_CONSOLE_SAMPLES = 20;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Sinal complementar ao de extractPageSignals (título/corpo): alguns desafios anti-bot
// redirecionam para uma URL própria sem que o título da página diga muito (ex.: Mercado
// Livre redireciona para .../account-verification durante a navegação).
const BLOCKED_URL_PATTERNS: RegExp[] = [
  /account-verification/i,
  /checkpoint/i,
  /\/challenge/i,
  /captcha/i,
];

// Piloto: os 6 grandes portais + 2 imobiliárias do cluster Universal/Imoview, para validar
// o método antes de rodar contra os 72 sites completos (etapa 3 do plano de discovery).
const PILOT_NAMES = new Set([
  'ZAP Imóveis',
  'Viva Real',
  'QuintoAndar',
  'Imovelweb',
  'OLX Imóveis',
  'Mercado Livre Imóveis',
  'Imobiliária Buritis',
  'Liderar Imóveis',
]);

function slugify(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((segment) => segment.length > 0)
    .join('-');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function emptyResultForSiteWithoutUrl(
  site: DiscoverySite,
  timestamp: string,
): ProbeResult {
  return {
    nome: site.nome,
    urlSolicitada: '',
    urlFinal: null,
    httpStatus: null,
    robots: {
      fetched: false,
      status: null,
      disallowedForTargetPath: null,
      contentSample: null,
    },
    estruturaDados: null,
    bloqueio: null,
    paginacao: null,
    requisicoesRede: [],
    consoleErros: [],
    titulo: null,
    bodyTextSample: null,
    screenshotPath: null,
    erro: 'sem URL confirmada — pulado',
    timestamp,
  };
}

async function probeSite(
  browser: Browser,
  site: DiscoverySite,
): Promise<ProbeResult> {
  const timestamp = new Date().toISOString();

  if (site.url === null) {
    return emptyResultForSiteWithoutUrl(site, timestamp);
  }
  const targetUrl = site.url;

  const robots = await fetchRobots(targetUrl);

  const context = await browser.newContext({ userAgent: USER_AGENT });
  const page = await context.newPage();

  const requisicoesRede: NetworkRequestSample[] = [];
  const consoleErros: string[] = [];

  page.on('request', (request) => {
    const resourceType = request.resourceType();
    const isXhrOrFetch = resourceType === 'xhr' || resourceType === 'fetch';
    if (isXhrOrFetch && requisicoesRede.length < MAX_NETWORK_SAMPLES) {
      requisicoesRede.push({
        method: request.method(),
        url: request.url(),
        resourceType,
      });
    }
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error' && consoleErros.length < MAX_CONSOLE_SAMPLES) {
      consoleErros.push(msg.text());
    }
  });

  let httpStatus: number | null = null;
  let urlFinal: string | null = null;
  let erro: string | null = null;
  let titulo: string | null = null;
  let bodyTextSample: string | null = null;
  let estruturaDados: ProbeResult['estruturaDados'] = null;
  let bloqueio: ProbeResult['bloqueio'] = null;
  let paginacao: ProbeResult['paginacao'] = null;
  let screenshotPath: string | null = null;

  try {
    const response = await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    httpStatus = response?.status() ?? null;
    urlFinal = page.url();

    await page
      .waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })
      .catch(() => undefined);

    const signals = await extractPageSignals(page);
    titulo = signals.titulo;
    estruturaDados = signals.estruturaDados;
    bodyTextSample = signals.bodyTextSample;

    const matchedUrlPattern = BLOCKED_URL_PATTERNS.find((pattern) =>
      pattern.test(urlFinal ?? ''),
    );
    bloqueio = {
      blocked: signals.bloqueio.blocked || matchedUrlPattern !== undefined,
      matchedPattern:
        signals.bloqueio.matchedPattern ?? matchedUrlPattern?.source ?? null,
    };

    paginacao = await extractPaginationSignals(page);

    const slug = slugify(site.nome);
    const candidateScreenshotPath = path.join(SCREENSHOTS_DIR, `${slug}.png`);
    await page.screenshot({ path: candidateScreenshotPath });
    screenshotPath = candidateScreenshotPath;
  } catch (error) {
    erro = error instanceof Error ? error.message : String(error);
  } finally {
    await page.close();
    await context.close();
  }

  return {
    nome: site.nome,
    urlSolicitada: targetUrl,
    urlFinal,
    httpStatus,
    robots,
    estruturaDados,
    bloqueio,
    paginacao,
    requisicoesRede,
    consoleErros,
    titulo,
    bodyTextSample,
    screenshotPath,
    erro,
    timestamp,
  };
}

async function loadSites(): Promise<DiscoverySite[]> {
  const raw = await readFile(SITES_PATH, 'utf-8');
  return JSON.parse(raw) as DiscoverySite[];
}

function parseOnlyFlag(argv: string[]): string | null {
  const onlyIndex = argv.indexOf('--only');
  if (onlyIndex === -1) return null;
  return argv[onlyIndex + 1] ?? null;
}

// Alvo avulso (site sem entrada em sites.json — ex.: página de listagem descoberta
// durante um diagnóstico pontual), sem precisar editar sites.json a cada URL testada.
function parseAdHocUrlFlag(argv: string[]): DiscoverySite | null {
  const urlIndex = argv.indexOf('--url');
  if (urlIndex === -1) return null;
  const url = argv[urlIndex + 1];
  if (url === undefined) {
    throw new Error('--url requer um valor (a URL completa a sondar)');
  }
  const nomeIndex = argv.indexOf('--nome');
  const nome = nomeIndex === -1 ? 'ad-hoc' : (argv[nomeIndex + 1] ?? 'ad-hoc');
  return { nome, url, categoria: 'imobiliaria' };
}

function selectTargets(
  sites: DiscoverySite[],
  only: string | null,
): DiscoverySite[] {
  if (only === 'pilot') {
    return sites.filter((site) => PILOT_NAMES.has(site.nome));
  }
  if (only !== null) {
    return sites.filter((site) => site.nome === only);
  }
  return sites;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const adHocSite = parseAdHocUrlFlag(argv);
  const only = parseOnlyFlag(argv);
  const targets =
    adHocSite !== null ? [adHocSite] : selectTargets(await loadSites(), only);

  if (!existsSync(SCREENSHOTS_DIR)) {
    await mkdir(SCREENSHOTS_DIR, { recursive: true });
  }

  console.log(
    `Sondando ${String(targets.length)} site(s)${only === 'pilot' ? ' (piloto)' : ''}...`,
  );

  const browser = await chromium.launch({ headless: true });

  try {
    for (const [index, site] of targets.entries()) {
      console.log(
        `[${String(index + 1)}/${String(targets.length)}] ${site.nome}`,
      );
      const result = await probeSite(browser, site);

      const slug = slugify(site.nome);
      await writeFile(
        path.join(OUTPUT_DIR, `${slug}.json`),
        JSON.stringify(result, null, 2),
        'utf-8',
      );

      if (result.erro !== null) {
        console.warn(`  -> erro: ${result.erro}`);
      }

      if (index < targets.length - 1) {
        await sleep(DELAY_BETWEEN_SITES_MS);
      }
    }
  } finally {
    await browser.close();
  }

  console.log('Concluído.');
}

await main();
