# terrestre-spider

Scraper do mercado imobiliário de Belo Horizonte, construído com [Crawlee](https://crawlee.dev/)
(`PlaywrightCrawler`, headless) e TypeScript estrito. Raspa OLX, Viva Real, ZAP Imóveis e
Netimóveis e persiste os anúncios em Postgres via TypeORM.

## Setup

1. `cp .env.example .env` e ajuste se necessário (valores padrão já funcionam com o
   `docker-compose.yml` de dev).
2. `npm run docker:up` — sobe o Postgres de desenvolvimento.
3. `npm run migration:run` — aplica o schema (`imoveis`, `observacoes_preco`).
4. `npm start` — roda as 4 fontes em sequência.

Para rodar uma fonte isolada: `npx tsx src/sources/olx/main.ts` (também vale para
`viva-real`, `zap-imoveis`, `netimoveis`).

## Arquitetura

- **Extract** (`src/sources/<fonte>/routes.ts`): `PlaywrightCrawler` headless por fonte, grava
  os itens raspados no Dataset nomeado do Crawlee (`storage/datasets/<fonte>`).
- **Load** (`src/persistence/load.ts`): lê o Dataset já populado e faz upsert em `imoveis` (por
  `link`) + insert append-only em `observacoes_preco`, todo scrape com o mesmo `scrapedAt`.
- **Orquestrador** (`src/main.ts`): roda as 4 fontes em sequência — não em paralelo, pensando na
  instância de produção (Postgres + API + crawler na mesma máquina, RAM limitada para múltiplos
  browsers headless simultâneos).
- **Config de busca** (`src/config/search-urls.json`): URLs de busca por fonte, versionadas —
  substitui o `config.json` + presets pessoais do app antigo (olx-rent-crawler).
- **Discovery** (`src/discovery/`): sonda sites candidatos (bloqueio anti-bot, dados
  estruturados, paginação) antes de portar um raspador novo — ver `npx tsx
src/discovery/probe.ts --only "<nome do site>"`.

## Scripts

| Script                              | Descrição                                                   |
| ----------------------------------- | ----------------------------------------------------------- |
| `npm start`                         | Roda o crawler em modo desenvolvimento (`tsx`, sem build)   |
| `npm run build`                     | Compila para `dist/`                                        |
| `npm run start:prod`                | Roda o build compilado                                      |
| `npm run docker:up` / `docker:down` | Sobe/derruba o Postgres de dev (`docker-compose.yml`)       |
| `npm run migration:generate`        | Gera migration a partir do diff das entidades (`-- <nome>`) |
| `npm run migration:run`             | Aplica migrations pendentes                                 |
| `npm run migration:revert`          | Reverte a última migration                                  |
| `npm run lint` / `lint:fix`         | ESLint (typescript-eslint strict + sonarjs + prettier)      |
| `npm run format` / `format:check`   | Prettier                                                    |
| `npm run typecheck`                 | `tsc --noEmit`                                              |
| `npm test` / `test:watch`           | Vitest                                                      |

Hooks de pre-commit (husky + lint-staged) rodam lint/format nos arquivos staged automaticamente.

## Referências

- [Documentation](https://crawlee.dev/js/api/playwright-crawler/class/PlaywrightCrawler)
- [Examples](https://crawlee.dev/js/docs/examples/playwright-crawler)
