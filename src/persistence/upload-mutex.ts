/**
 * Serializa a fase de upload/registro de captura bruta entre fontes rodando
 * em paralelo (SPIDER_BATCH_SIZE > 1, ver src/main.ts). Achado ao vivo numa
 * run real: duas fontes grandes chamando `uploadCapturasBrutas` ao mesmo
 * tempo corromperam o armazenamento local do Crawlee (erro `JSON5: invalid
 * end of input` dentro de `@crawlee/memory-storage/body-parser.js`, perdendo
 * a captura inteira de uma das fontes). O Extract (a parte lenta, rede)
 * continua paralelo — só o upload, que mexe nesse armazenamento
 * compartilhado, passa a rodar um de cada vez.
 */
export class Mutex {
  private queue: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
