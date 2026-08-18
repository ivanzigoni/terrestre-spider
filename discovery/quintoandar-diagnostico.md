# Diagnóstico — integração do Quinto Andar

Data: 17-08-2026

Diagnóstico de viabilidade para adicionar o Quinto Andar (quintoandar.com.br) como quinta fonte
do crawler, ao lado de OLX, Viva Real, ZAP Imóveis e Netimóveis. Este documento não implementa a
fonte — é o entregável que habilita uma tarefa de implementação futura a começar direto pela
decisão de arquitetura, sem repetir a exploração.

Evidência bruta: `discovery/output/quintoandar.json` (sondagem antiga, só da home),
`discovery/output/quintoandar-busca-bh-aluguel.json` e
`discovery/output/quintoandar-busca-bh-venda.json` (sondagens novas, contra as páginas de busca
reais).

## URLs de busca reais (Belo Horizonte)

A sondagem antiga cobria só a home (`https://www.quintoandar.com.br/`), que não tem cards de
imóveis nem paginação de resultados. As URLs de busca reais, confirmadas por navegação direta e
formalizadas via `src/discovery/probe.ts`, são:

- Aluguel: `https://www.quintoandar.com.br/alugar/imovel/belo-horizonte-mg-brasil`
- Venda: `https://www.quintoandar.com.br/comprar/imovel/belo-horizonte-mg-brasil`

Ambas HTTP 200, sem bloqueio anti-bot detectado (`bloqueio.blocked: false` nas duas sondagens),
`robots.disallowedForTargetPath: false`. São as URLs candidatas para uma futura entrada em
`src/config/search-urls.json` — só como registro, o arquivo não foi criado/alterado.

## Decisão de arquitetura: Cheerio vs Playwright vs API JSON

**Achado central**: ao contrário da home (`hasNextData: false`), a página de busca real **é
renderizada no servidor** — `estruturaDados.hasNextData: true` confirmado nas duas sondagens
novas. Um `curl` simples, sem JavaScript, já traz o `__NEXT_DATA__` populado e os cards de imóveis
completos no HTML servido (endereço, bairro, m², quartos, vagas e preço agregados no `aria-label`
de cada card, ex.: _"Buritis, Belo Horizonte, Rua Lauro Ferreira. 235 metros quadrados, 3 quartos,
3 vagas de garagem. R$ 12.230 total, R$ 10.000 aluguel."_).

Isso abre duas rotas viáveis, ambas sem depender de Playwright para a extração em si:

**Opção A — DOM scraping com `CheerioCrawler`** (reaproveita o padrão das 4 fontes atuais)

- Prós: mesmo padrão dos 4 routers existentes (`src/sources/olx/routes.ts` como referência mais
  próxima, também `CheerioCrawler`); mais barato que Playwright; mais fácil de revisar por quem já
  conhece o projeto.
- Contras: depende de seletores CSS com classes hasheadas geradas no build
  (ex.: `StyledLink_styledLink__P_6FN`), que tendem a quebrar a cada deploy do Quinto Andar — teria
  que se apoiar em atributos estáveis como `data-testid="house-card-container-rent"` em vez de
  classe, e mesmo assim é mais frágil que um contrato de API.

**Opção B — cliente HTTP consumindo a API JSON de busca diretamente**

- Existe uma API pública, **sem autenticação de nenhum tipo** (sem API key, sem token, sem cookie
  de sessão), usada pela própria busca do site: `POST
https://apigw.prod.quintoandar.com.br/house-listing-search/v3/search/list`. Verificado com um
  `curl` isolado a partir de fora do navegador — sem cookies, sem sessão, `deviceId` inventado,
  só os headers `Content-Type`/`Accept`/`User-Agent` — e o endpoint devolveu HTTP 200 com JSON
  estruturado real (5 imóveis de Belo Horizonte com endereço, área, quartos, banheiros, vagas,
  aluguel, `condominium`, `iptu`, tipo, `forRent`/`forSale`). O corpo da requisição foi replicado a
  partir do que o próprio site envia (capturado via DevTools/Playwright), mas nenhum dado dessa
  captura — cookie, header de sessão, token — precisou ser reaproveitado para a chamada funcionar.
  A resposta também não trouxe nenhum header típico de rate-limit (`X-RateLimit-*`, `Retry-After`).
- `Access-Control-Allow-Origin` da resposta é restrito a `https://www.quintoandar.com.br` — mas
  isso é CORS, que só o navegador aplica; um cliente HTTP server-side (Node, `fetch`/`curl`) não é
  afetado por CORS, então essa restrição não bloqueia um scraper.
- Prós: nenhuma das 4 fontes atuais faz isso hoje, mas um contrato de API tende a ser mais estável
  que classes CSS; paginação trivial (ver seção seguinte); payload já estruturado, sem parsing de
  HTML; nenhuma barreira de autenticação a contornar.
- Contras: endpoint não documentado publicamente, sem contrato formal — pode mudar sem aviso;
  arquitetura nova, sem precedente no projeto (ver "Riscos" abaixo sobre robots.txt da API).

**Verificação de que os dados são reais, não isca/honeypot**: dado que uma API pública e sem
autenticação devolvendo dados estruturados é incomum o suficiente para levantar suspeita, três
checagens independentes foram feitas para descartar a hipótese de dado fabricado/decoy:

1. **IDs batem, na mesma ordem**: os 5 `_id` retornados pela chamada isolada à API
   (`895226985`, `894334726`, `892931352`, `894638380`, `895091864`) são exatamente os mesmos IDs
   presentes nos links `/imovel/<id>/...` da página de busca real, renderizada no servidor, na
   mesma ordem de exibição.
2. **Os campos batem 1:1**: endereço, área, quartos, vagas e aluguel do primeiro item da API
   (`Rua Professor Alberto Deodato`, 271 m², 3 quartos, 1 vaga, R$ 9.690) são idênticos ao
   `aria-label` do card correspondente na página real (`"Bandeirantes (pampulha)... Rua Professor
   Alberto Deodato. 271 metros quadrados, 3 quartos, 1 vaga de garagem... R$ 9.690 aluguel."`).
3. **A página individual do anúncio existe e confirma os mesmos dados**: `quintoandar.com.br
/imovel/895226985/alugar/casa-3-quartos-bandeirantes-pampulha-belo-horizonte` abre normalmente,
   com título gerado no servidor `"Casa com 3 quartos para alugar em Bandeirantes (pampulha), Belo
Horizonte por R$ 9.690,00"` — mesmo imóvel, mesmo preço, mesmo bairro.

Conclusão: é o mesmo dado real que qualquer visitante vê, servido pela mesma infraestrutura de
produção (CloudFront + Envoy nos headers de resposta) — é a chamada que o próprio front-end do
site faz para montar a página, não um endpoint isolado projetado para capturar scraper.

**O que essa verificação não cobre**: só um punhado de requisições foi testado, então isso confirma
que os dados são reais, não que não existe algum tipo de limitação por volume (rate-limit ou
bloqueio de IP após muitas chamadas) — pergunta diferente, sobre robustez em produção, que segue em
aberto. Esse teste de volume não foi feito de propósito, para não gerar tráfego repetitivo contra o
site de terceiros sem necessidade neste diagnóstico.

**Recomendação, não decisão fechada**: a Opção B (API JSON) parece estrategicamente melhor dado
que o contrato de campos tende a ser mais estável que os seletores CSS, mas é uma escolha que
envolve trade-off de postura (endpoint não documentado) além de técnica — fica registrada aqui com
evidência para quem aprovar a implementação decidir.

## Paginação

Divergente dos 4 padrões já existentes no projeto:

| Fonte            | Mecanismo                                                                                                                                                                  | Onde vive no código                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| OLX              | link `<a>` com texto = próximo número, `?o=N`                                                                                                                              | `src/sources/olx/routes.ts:105-120`         |
| Viva Real        | `<a rel="next">` real, `enqueueLinks` direto                                                                                                                               | `src/sources/viva-real/routes.ts:113-123`   |
| ZAP Imóveis      | mesmo padrão de "next", via `page.evaluate` (Playwright)                                                                                                                   | `src/sources/zap-imoveis/routes.ts:142-151` |
| Netimóveis       | incrementa `?pagina=N` manualmente na URL                                                                                                                                  | `src/sources/netimoveis/routes.ts:119-132`  |
| **Quinto Andar** | botão "Ver mais" sem `href`; `?pagina=N` na URL é **cosmético** (`history.pushState`, não recarrega); paginação real é `offset`/`pageSize` no corpo do POST à API de busca | sem precedente                              |

Confirmado por teste direto: um `curl` em `?pagina=2` devolveu exatamente os mesmos 24 cards da
página 1 (100% de sobreposição de IDs) — diferente do Netimóveis, aqui o parâmetro de URL não
dispara nova busca no servidor. A sondagem formal corrobora: `paginacao.hasNumberedPagination:
true`, `paginacao.hasNextLink: false` nas duas páginas de busca — sem `<a rel="next">` nem link de
próxima página navegável.

**Implicação por opção de arquitetura**:

- Opção A (Cheerio/DOM): precisaria chamar a mesma API só para obter a próxima leva de resultados
  — misturar scraping de DOM com chamada de API apenas para paginar é um sinal a favor da Opção B.
- Opção B (API JSON): paginação trivial, `offset += pageSize` até o total retornado pela API.

**Observação sobre a página inicial**: a sondagem formal via `probe.ts` capturou nas
`requisicoesRede` as chamadas `house-listing-search/v1/search/filters`, `v3/search/count` e
`v2/search/coordinates`, mas **não** capturou `v3/search/list` no carregamento inicial da página —
a primeira leva de resultados vem via a rota de dados do Next.js
(`_next/data/<build-id>/pt-BR.json`, presente no `__NEXT_DATA__`), e o POST a `v3/search/list`
só é disparado ao clicar em "Ver mais" (interação que o probe não simula, e que também pode ter
ficado fora do teto de 40 amostras de rede do `probe.ts`, `MAX_NETWORK_SAMPLES` em
`src/discovery/probe.ts:24`). Ou seja: a Opção B precisaria decidir entre ler a primeira página via
`_next/data/.../pt-BR.json` e as páginas seguintes via `v3/search/list`, ou usar `v3/search/list`
para tudo (mais uniforme, e é o que o teste manual usou com sucesso desde a primeira página).

## Mapeamento de campos (`RawListingItem`)

| `RawListingItem`                        | Fonte no Quinto Andar                                                                                                                                                                                                                                                                                                                                                                                                                                     | Observação                                                                                                                                                                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `origin`                                | fixo, novo valor de enum (fora de escopo do diagnóstico)                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                                                                                                          |
| `transactionType`                       | `businessContext` da requisição (`RENT`/`SALE`)                                                                                                                                                                                                                                                                                                                                                                                                           | no teste manual, `forSale` veio `false` mesmo com `businessContext: "SALE"` num item com `salePrice` preenchido — checar na implementação se é inconsistência real da API ou efeito de um request de teste incompleto                                                      |
| `propertyType`                          | `type` (já vem em português: `"Apartamento"`, `"Casa"`)                                                                                                                                                                                                                                                                                                                                                                                                   | não precisa mapear vocabulário como o OLX faz a partir do slug da URL                                                                                                                                                                                                      |
| `link`                                  | montar a partir do `id`, ou `href` do card SSR                                                                                                                                                                                                                                                                                                                                                                                                            | cards trazem `?search_id=...&search_rank=...` na query string — **precisa canonizar (remover query string) antes de gravar**, senão o upsert por `link` (único no schema, `src/persistence/entities/imovel.entity.ts:19-20`) nunca bate entre dois scrapes do mesmo imóvel |
| `title`                                 | `title`/`aria-label` do card, ou montado a partir de `type`+`bedrooms`+`neighbourhood`                                                                                                                                                                                                                                                                                                                                                                    | —                                                                                                                                                                                                                                                                          |
| `bedrooms`, `bathrooms`, `parkingSpots` | `bedrooms`, `bathrooms`, `parkingSpaces`                                                                                                                                                                                                                                                                                                                                                                                                                  | mapeamento direto                                                                                                                                                                                                                                                          |
| `area`                                  | `area`                                                                                                                                                                                                                                                                                                                                                                                                                                                    | mapeamento direto                                                                                                                                                                                                                                                          |
| `location`                              | `address` + `regionName`/`neighbourhood` + `city`                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                                                                                                                                                                          |
| `datePostedText`                        | **gap confirmado** — não localizado. Tentei o nome de campo `createdAt` na lista de `fields` de um POST real a `v3/search/list`; a API não retornou erro, mas também não devolveu o campo (nomes desconhecidos parecem ser silenciosamente ignorados)                                                                                                                                                                                                     | nome de campo correto (se existir) não identificado; decisão em aberto para a implementação                                                                                                                                                                                |
| `price`                                 | `rent` (aluguel) ou `salePrice` (venda)                                                                                                                                                                                                                                                                                                                                                                                                                   | confirmado por POST real a `v3/search/list` — campos numéricos diretos                                                                                                                                                                                                     |
| `iptu`, `condominio`                    | **resolvido, corrigindo um achado anterior errado deste documento** — `condominium` e `iptu` vêm como campos numéricos **separados** (confirmado por POST real a `v3/search/list` pedindo os dois no `fields`; sentinela `-1` quando não se aplica ao imóvel). O achado anterior ("só vem `iptuPlusCondominium` combinado") veio de um teste que não pediu esses campos individualmente e não foi verificado antes de entrar no documento — estava errado | mapeamento direto, sem gap                                                                                                                                                                                                                                                 |
| `oldPrice`                              | **gap confirmado** — não identificado; existe uma flag `activeSpecialConditions: ["rentPriceDecreased"]` sinalizando queda de preço, mas sem o valor antigo                                                                                                                                                                                                                                                                                               | mesma categoria de gap do `datePostedText`                                                                                                                                                                                                                                 |

Dos três gaps originalmente listados, um (`iptu`/`condominio`) era um falso gap — resolvido acima
após verificação direta. Os outros dois (`datePostedText`, `oldPrice`) seguem sem campo
identificado; ficam registrados como decisão/investigação para a implementação, não resolvidos
pelo catálogo de filtros da API (que é definição de facetas de UI, não schema de listagem).

## Riscos e pontos em aberto para o time (não só engenharia)

- **`robots.txt` do domínio principal** (`www.quintoandar.com.br`) não desautoriza as URLs de
  busca planejadas nem os paths base `/alugar/imovel/*` e `/comprar/imovel/*` — só desautoriza
  combinações específicas de query string (`?filters=true$`, `?redirect*`, `?search_id=*`,
  `?portfolio_ref=*`), nenhuma das quais as URLs planejadas usam.
  - Ressalva técnica: `src/discovery/robots.ts` faz o match de disallow com
    `pathname.startsWith(rule)`, sem suporte a wildcard (`*`) nem a query string — o campo
    `disallowedForTargetPath` do probe nunca vai capturar essas regras de query string
    corretamente. Para as URLs planejadas (sem query string) isso não muda a conclusão, mas não dá
    para confiar cegamente nesse campo para URLs com parâmetros no futuro.
- **`apigw.prod.quintoandar.com.br` (host da API) não tem `robots.txt`** (404 confirmado) — não é
  um "permitido por omissão" inequívoco, é uma zona cinzenta que o robots.txt do domínio principal
  simplesmente não cobre, por ser um host de API interna. Se a Opção B (API JSON) for escolhida,
  este é um risco/pergunta em aberto para o time decidir, não algo que a engenharia resolve
  sozinha.
- **Agendamento diário de produção não está documentado no Terraform** (`terrestre-iac`) nem em
  nenhum script versionado — parece manual na instância EC2. Não bloqueia este diagnóstico, mas é
  uma pergunta a fazer ao time antes de qualquer implementação real (uma quinta fonte aumenta o
  tempo total de execução do orquestrador sequencial, `src/main.ts:14-19,26-37`).
- Sem testes de parsing/HTTP para nenhuma das 4 fontes atuais — se a implementação futura decidir
  cobrir a nova fonte com testes, não há fixture/mock a copiar; seria precedente novo no projeto.

## Próximo passo (fora deste diagnóstico)

Com este documento, uma tarefa de implementação pode começar direto pela decisão de arquitetura
(Opção A vs B) em vez de repetir a exploração — decisão que fica registrada aqui como recomendação
(Opção B), não como escolha fechada.
