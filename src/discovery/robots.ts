import type { RobotsInfo } from './types.js';

const ROBOTS_FETCH_TIMEOUT_MS = 10_000;
const ROBOTS_SAMPLE_LENGTH = 2000;
// Vários sites bloqueiam requisições sem um User-Agent de navegador reconhecível
// (retornam 403 até para /robots.txt). Usamos o mesmo UA da navegação Playwright.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function isPathDisallowed(robotsTxt: string, pathname: string): boolean {
  const disallowRules: string[] = [];
  let inWildcardBlock = false;

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === 'user-agent') {
      inWildcardBlock = value === '*';
    } else if (key === 'disallow' && inWildcardBlock && value.length > 0) {
      disallowRules.push(value);
    }
  }

  return disallowRules.some((rule) => pathname.startsWith(rule));
}

export async function fetchRobots(targetUrl: string): Promise<RobotsInfo> {
  const { origin, pathname } = new URL(targetUrl);
  const robotsUrl = `${origin}/robots.txt`;

  try {
    const response = await fetch(robotsUrl, {
      signal: AbortSignal.timeout(ROBOTS_FETCH_TIMEOUT_MS),
      headers: { 'user-agent': USER_AGENT },
    });

    if (!response.ok) {
      return {
        fetched: true,
        status: response.status,
        disallowedForTargetPath: null,
        contentSample: null,
      };
    }

    const text = await response.text();
    return {
      fetched: true,
      status: response.status,
      disallowedForTargetPath: isPathDisallowed(text, pathname),
      contentSample: text.slice(0, ROBOTS_SAMPLE_LENGTH),
    };
  } catch {
    return {
      fetched: false,
      status: null,
      disallowedForTargetPath: null,
      contentSample: null,
    };
  }
}
