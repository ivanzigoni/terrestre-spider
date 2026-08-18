import { MAX_REQUESTS_PER_CRAWL } from './crawler-defaults.js';

// O Crawlee já tem timeout interno (navigationTimeoutSecs, default 30s), mas na prática já
// vimos o processo travar por mais de 1h durante o crawling sem nenhum retry nem log —
// sinal de que a promise ficou pendurada num nível abaixo do que esse timeout cobre. Este
// watchdog é uma rede de segurança externa, independente do Crawlee: se crawler.run() não
// voltar dentro do teto, desistimos daquela URL de busca em vez de travar o processo
// inteiro (as outras fontes) indefinidamente.
const WATCHDOG_SECONDS_PER_REQUEST = 10; // ritmo observado é ~3s/request; generoso de propósito
const WATCHDOG_MINIMUM_SECS = 300; // nunca menos que 5min, mesmo com poucas páginas

export function watchdogTimeoutMs(maxRequestsPerCrawl: number): number {
  return (
    Math.max(
      maxRequestsPerCrawl * WATCHDOG_SECONDS_PER_REQUEST,
      WATCHDOG_MINIMUM_SECS,
    ) * 1000
  );
}

/**
 * `Promise.race` não cancela `run` se ele perder a corrida — um crawler travado continua
 * rodando em segundo plano, órfão, até o processo terminar. O ganho aqui não é liberar
 * esses recursos, é não deixar o processo inteiro refém de uma única fonte travada.
 */
export async function runWithWatchdog<T>(
  label: string,
  run: Promise<T>,
): Promise<T> {
  const timeoutMs = watchdogTimeoutMs(MAX_REQUESTS_PER_CRAWL);
  let timer!: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `${label}: crawler.run() não terminou em ${String(timeoutMs / 1000)}s`,
        ),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
