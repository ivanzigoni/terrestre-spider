import { createServer } from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';

const PORT = 3100;
// Cópia read-only do projeto montada pelo docker-compose.yml — cwd aqui é o que faz o
// `docker compose` (rodando neste container, via socket do host) resolver o projeto certo
// ("Docker-outside-of-Docker": cliente empacota o contexto local, daemon do host executa).
const WORKDIR = '/workspace';

const EXPECTED_USERNAME = 'grafana';
const EXPECTED_PASSWORD = process.env.TRIGGER_WEBHOOK_PASSWORD;
if (!EXPECTED_PASSWORD) {
  // Falha alto e na inicialização — sem isso, um .env incompleto faria o serviço subir
  // aceitando qualquer coisa (ou nada) como senha, silenciosamente.
  throw new Error(
    'TRIGGER_WEBHOOK_PASSWORD não definido no ambiente do container trigger',
  );
}

function log(event, fields = {}) {
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), event, ...fields }),
  );
}

// Compara por hash de tamanho fixo antes do timingSafeEqual: ele lança se os buffers têm
// tamanho diferente, o que por si só já vazaria informação (tempo) sobre o tamanho da senha
// certa numa comparação ingênua.
function safeEqual(a, b) {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

function isAuthorized(req) {
  const header = req.headers.authorization;
  if (!header) {
    log('auth_debug', { reason: 'no-authorization-header' });
    return false;
  }
  if (!header.startsWith('Basic ')) {
    log('auth_debug', { reason: 'not-basic-scheme' });
    return false;
  }

  let decoded;
  try {
    decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString(
      'utf8',
    );
  } catch {
    log('auth_debug', { reason: 'base64-decode-failed' });
    return false;
  }

  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) {
    log('auth_debug', { reason: 'no-colon-separator' });
    return false;
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);
  const ok =
    safeEqual(username, EXPECTED_USERNAME) &&
    safeEqual(password, EXPECTED_PASSWORD);
  if (!ok) {
    // Só tamanhos, nunca os valores — dá pra saber se a senha recebida veio vazia
    // (interpolação falhou) ou só diferente (valores fora de sincronia entre os .env).
    log('auth_debug', {
      reason: 'mismatch',
      usernameReceivedLength: username.length,
      usernameExpectedLength: EXPECTED_USERNAME.length,
      passwordReceivedLength: password.length,
      passwordExpectedLength: EXPECTED_PASSWORD.length,
    });
  }
  return ok;
}

// Guard primário: flag em memória, checada e setada de forma síncrona (event loop único do
// Node, sem race entre checar e marcar). Cobre inclusive a janela de build da imagem — nessa
// fase ainda não existe container nenhum, então um guard baseado só em `docker compose ps`
// não vê nada e deixa passar uma segunda run em paralelo (reproduzido na prática: duas
// chamadas a 1s de distância dispararam dois builds simultâneos da mesma imagem).
let runInProgress = false;

// Guard secundário: cobre o caso do processo trigger ter reiniciado enquanto uma run
// (disparada por ele mesmo antes do restart, ou por um humano rodando `docker compose up`
// direto) ainda está de pé — cenário que o flag em memória, sozinho, não teria como saber.
function isSpiderRunning() {
  return new Promise((resolve, reject) => {
    execFile(
      'docker',
      ['compose', 'ps', '--status', 'running', '--format', 'json', 'spider'],
      { cwd: WORKDIR, timeout: 10_000 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        const trimmed = stdout.trim();
        resolve(trimmed !== '' && trimmed !== '[]');
      },
    );
  });
}

function startSpiderRun() {
  // runInProgress já foi setado sincronamente pelo handler, antes de qualquer await — ver
  // comentário lá. Aqui só spawna.

  // stdio herdado pelo processo pai (este container) → aparece no `docker logs` do
  // container trigger → já capturado pelo Alloy/Loki, mesma pipeline que coleta o resto
  // dos containers do host.
  const child = spawn('docker', ['compose', 'run', '--rm', 'spider'], {
    cwd: WORKDIR,
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  child.on('exit', (exitCode) => {
    runInProgress = false;
    log('spider_run_finished', { exitCode });
  });

  child.on('error', (error) => {
    runInProgress = false;
    log('spider_run_spawn_error', { message: error.message });
  });
}

const server = createServer((req, res) => {
  log('request_received', { method: req.method, url: req.url });

  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }

  if (req.method === 'POST' && req.url === '/run') {
    if (!isAuthorized(req)) {
      log('run_rejected_unauthorized');
      res.writeHead(401, {
        'content-type': 'application/json',
        'www-authenticate': 'Basic realm="spider trigger"',
      });
      res.end(JSON.stringify({ status: 'unauthorized' }));
      return;
    }

    if (runInProgress) {
      log('run_rejected_already_running', { guard: 'in-memory' });
      res.writeHead(409, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'already-running' }));
      return;
    }

    // Setado SINCRONAMENTE aqui, antes de qualquer `await`/callback assíncrono — é isso que
    // fecha a race entre duas requisições chegando "ao mesmo tempo". Setar isso só dentro do
    // `.then()` do isSpiderRunning() (versão anterior, com bug) deixava as duas passarem pelo
    // `if (runInProgress)` acima antes de qualquer uma marcar a flag — reproduzido na prática
    // com duas chamadas via Promise.all, as duas voltaram 202.
    runInProgress = true;

    isSpiderRunning()
      .then((running) => {
        if (running) {
          // Guard secundário pegou algo que o nosso próprio flag não tinha como saber (run
          // de outra origem) — desfaz a marca, já que não fomos nós que iniciamos nada.
          runInProgress = false;
          log('run_rejected_already_running', { guard: 'docker-ps' });
          res.writeHead(409, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ status: 'already-running' }));
          return;
        }

        startSpiderRun();
        log('run_started');
        res.writeHead(202, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'started',
            startedAt: new Date().toISOString(),
          }),
        );
      })
      .catch((error) => {
        runInProgress = false;
        log('run_check_failed', { message: error.message });
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'error' }));
      });
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ status: 'not-found' }));
});

server.listen(PORT, () => {
  log('trigger_listening', { port: PORT });
});
