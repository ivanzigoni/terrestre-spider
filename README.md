# terrestre-spider

Scraper do mercado imobiliário de Belo Horizonte (cidade inteira, aluguel e venda, todos os
tipos de imóvel), construído com [Crawlee](https://crawlee.dev/) e TypeScript estrito. Raspa
OLX, Viva Real, ZAP Imóveis e Netimóveis e persiste os anúncios em Postgres via TypeORM.

## Setup

1. `cp .env.example .env` e preencha a senha do Supabase (painel > Connect > Connection
   parameters) — dev e produção usam o mesmo Postgres (Supabase), não há Postgres local.
2. `npm run migration:run` — aplica o schema (`anuncios`, `observacoes_preco`).
3. `npm start` — roda as 4 fontes em sequência.

O `docker-compose.yml` builda e roda o crawler containerizado (serviço `spider`), lendo as
credenciais do Supabase do próprio `.env` — útil para testar localmente o mesmo container
pensado para produção (EC2).

Para rodar uma fonte isolada: `npx tsx src/sources/olx/main.ts` (também vale para
`viva-real`, `zap-imoveis`, `netimoveis`).

## Arquitetura

- **Extract** (`src/sources/<fonte>/routes.ts`): um crawler por fonte, grava os itens raspados
  no Dataset nomeado do Crawlee (`storage/datasets/<fonte>`). OLX e Viva Real usam
  `CheerioCrawler` (sites 100% renderizados no servidor — sem precisar de browser); Netimóveis e
  ZAP Imóveis usam `PlaywrightCrawler` headless (parte do conteúdo só existe depois do JS
  rodar — confirmado ao vivo, não é escolha arbitrária).
- **Load** (`src/persistence/load.ts`): lê o Dataset já populado e faz upsert em `anuncios` (por
  `link`) + insert append-only em `observacoes_preco`, todo scrape com o mesmo `scrapedAt`.
  `current_total_price` é `price + iptu + condominio` no aluguel, só `price` na venda (somar
  custo recorrente ao preço de compra não faz sentido).
- **Transação e tipo do imóvel**: cada fonte tem 2 URLs de busca (aluguel e venda, ver
  `search-urls.json`) — `transactionType` viaja no `userData` da request do Crawlee, propagado
  manualmente na paginação. `propertyType` é extraído por fonte, cada uma do seu jeito (não tem
  padrão único): OLX usa a categoria da URL do anúncio (`imoveis`/`terrenos`/...), Netimóveis usa
  o parâmetro `tipoUrl` do link, Viva Real e ZAP usam segmentos do slug da URL do anúncio.
- **Orquestrador** (`src/main.ts`): roda as 4 fontes em sequência — não em paralelo, pensando na
  instância de produção (Postgres + API + crawler na mesma máquina, RAM limitada para múltiplos
  browsers headless simultâneos).
- **Pacing** (`src/sources/shared/crawler-defaults.ts`): `sameDomainDelaySecs` dá um intervalo
  mínimo entre requests pro mesmo domínio (default do Crawlee é 0s), e `maxRequestsPerCrawl`
  limita a paginação a 20 páginas por URL de busca (citywide sem esse teto pode passar de 100
  páginas) — os dois pensando em rodar o crawler diariamente sem se parecer com tráfego
  automatizado em rajada.
- **Config de busca** (`src/config/search-urls.json`): URLs de busca por fonte (aluguel + venda,
  cidade inteira, sem filtro de tipo/preço/quartos), versionadas — substitui o `config.json` +
  presets pessoais do app antigo (olx-rent-crawler).
- **Discovery** (`src/discovery/`): sonda sites candidatos (bloqueio anti-bot, dados
  estruturados, paginação) antes de portar um raspador novo — ver `npx tsx
src/discovery/probe.ts --only "<nome do site>"`.

## Scripts

| Script                              | Descrição                                                      |
| ----------------------------------- | -------------------------------------------------------------- |
| `npm start`                         | Roda o crawler em modo desenvolvimento (`tsx`, sem build)      |
| `npm run build`                     | Compila para `dist/`                                           |
| `npm run start:prod`                | Roda o build compilado                                         |
| `npm run docker:up` / `docker:down` | Builda/derruba o crawler containerizado (`docker-compose.yml`) |
| `npm run migration:generate`        | Gera migration a partir do diff das entidades (`-- <nome>`)    |
| `npm run migration:run`             | Aplica migrations pendentes                                    |
| `npm run migration:revert`          | Reverte a última migration                                     |
| `npm run lint` / `lint:fix`         | ESLint (typescript-eslint strict + sonarjs + prettier)         |
| `npm run format` / `format:check`   | Prettier                                                       |
| `npm run typecheck`                 | `tsc --noEmit`                                                 |
| `npm test` / `test:watch`           | Vitest                                                         |

Hooks de pre-commit (husky + lint-staged) rodam lint/format nos arquivos staged automaticamente.

## Referências

- [Documentation](https://crawlee.dev/js/api/playwright-crawler/class/PlaywrightCrawler)
- [Examples](https://crawlee.dev/js/docs/examples/playwright-crawler)
