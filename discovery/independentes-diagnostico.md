# Diagnóstico — imobiliárias independentes de BH (fora do cluster Imoview original)

Data: 23-08-2026

Execução do Nível 1-4 de `discovery/plano-diagnostico-imobiliarias-independentes.md` contra as 30
imobiliárias independentes catalogadas em `src/discovery/sites.json` (categoria `imobiliaria`) sem
diagnóstico prévio. Este documento registra o que foi encontrado; não implementa nenhuma fonte nova
— mesmo papel que `imoview-diagnostico.md` cumpriu antes da implementação de Buritis/Liderar/Casa
Grande.

**Resultado principal: a hipótese de partida do plano ("30 plataformas presumivelmente distintas,
sem hipótese de agrupamento") estava parcialmente errada.** O Nível 1 (reconhecimento estático)
revelou 3 agrupamentos por sinal repetido de CDN/rodapé, cobrindo 18 das 30 imobiliárias — mais da
metade. Um deles (Kenlo) tem uma API tão limpa quanto a do cluster Imoview original.

Evidência bruta:

- `discovery/output/independentes-nivel1/nivel1-resultados.csv` — reconhecimento estático (Nível 1)
  das 29 imobiliárias com URL conhecida (rodapé, CDN externo, robots, links de listagem candidatos).
- `discovery/output/kenlo-piloto-jmc.json`, `discovery/output/loft-piloto-casapampulha.json`,
  `discovery/output/imobibrasil-piloto-strutural.json`, `discovery/output/bloqueado-piloto-casamineira.json`,
  `discovery/output/bloqueado-piloto-lemos.json` — sondagens Nível 3 via `src/discovery/probe.ts`
  (ver "Extensão de ferramenta" abaixo).

## Extensão de ferramenta: `probe.ts --url`

`src/discovery/probe.ts` só aceitava alvos já catalogados em `sites.json` por nome (`--only`). Para
sondar páginas de listagem (não a home, que não tinha entrada própria em `sites.json` para nenhuma
das 30) sem editar `sites.json` a cada teste, foi adicionado um flag `--url <url> [--nome <nome>]`
que monta um `DiscoverySite` avulso em memória e roda a mesma sondagem, salvando em
`discovery/output/<slug-do-nome>.json` (mesmo formato de saída, nenhuma mudança em
`extractPageSignals`/`ProbeResult`). Usado nas 5 sondagens listadas acima.

## Achado 1 — o cluster Universal Software/Imoview é maior do que o documentado

O Nível 1 comparou rodapé e CDN externo entre as 29 e achou `universalsoftware.com.br` (rodapé) ou
`portalunsoft.com.br`/`cliente.portalunsoft.com.br` (CDN) em **10 sites** que não faziam parte dos
18 candidatos originais de `imoview-diagnostico.md`. Mesma lição daquele diagnóstico se confirmou
de novo: **o sinal sozinho não decide** — dos 10, só 7 respondem de verdade ao endpoint
`/retornar-cidades-disponiveis`.

### Confirmados como Imoview real (`resolveCidadeCode` resolve Belo Horizonte)

| Site                 | Situação em 23-08-2026                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AdimóveisBH**      | **Pronto para integração** — `/retornar-imoveis-disponiveis` respondeu 869 imóveis à venda em BH, 20/20 itens da amostra passaram no parser existente (`imoview-client.ts`) sem nenhuma mudança de contrato. Mesmo padrão de Buritis/Liderar (variante HTTP, `createImoviewRun`).                                                                                                                     |
| Diego Garcia Imóveis | Cidade resolvida (`codigo=1`), mas `/retornar-imoveis-disponiveis` devolveu um erro de proxy interno (`"Curl failed... 500", redirect: ".../manutencao"`) — mesma assinatura de erro que o Liderar apresentou por >2h antes de normalizar (ver `imoview-diagnostico.md`, "Achado real"). Revisitar antes de decidir.                                                                                  |
| Valore Imóveis       | Cidade resolvida, mas endpoint respondeu HTTP 500 direto (sem o envelope JSON de erro do Diego Garcia). Revisitar.                                                                                                                                                                                                                                                                                    |
| IVI Invista Imóveis  | Precisa do prefixo `www.` (a home sem `www` dá 410 — redireciona só via navegador). Com `www.`, cidade resolvida, mas mesmo erro de "manutenção" do Diego Garcia. Revisitar.                                                                                                                                                                                                                          |
| Real Imobiliária     | Cidade resolvida, endpoint devolveu HTTP 500 direto (mesmo padrão do Valore). Revisitar.                                                                                                                                                                                                                                                                                                              |
| MG Galpões           | Cidade resolvida (`codigo=6`), mas `/retornar-imoveis-disponiveis` devolve `{"favoritos":[]}` (não o envelope `{"lista":...,"quantidade":...}`) tanto para `venda` quanto `aluguel` em BH — o PHP emite warnings de `foreach` sobre argumento vazio antes disso. Mesma categoria do achado "Administrar Imóveis" do diagnóstico anterior: plataforma confirmada, sem inventário funcional em BH hoje. |
| BH Brokers Imóveis   | Cidade resolvida, mas `/retornar-imoveis-disponiveis` lança exceção fatal do PHP (stack trace completo na resposta, HTTP 200) tanto para `venda` quanto `aluguel`. Backend quebrado no momento do teste, não é bloqueio.                                                                                                                                                                              |

### Descartados — footer/CDN de Universal Software, mas não rodam o produto de busca

| Site            | Evidência do descarte                      |
| --------------- | ------------------------------------------ |
| Carlos Imóveis  | `/retornar-cidades-disponiveis` → HTTP 404 |
| Só Galpões      | `/retornar-cidades-disponiveis` → HTTP 404 |
| Imóvel Certo BH | `/retornar-cidades-disponiveis` → HTTP 404 |

Esses três usam a mesma agência de desenvolvimento web (ou o mesmo CDN de assets,
`portalunsoft.com.br`) mas não têm o produto de busca de imóveis Imoview ativo — confirma de novo
que rodapé/CDN é sinal de agrupamento a testar, nunca critério de decisão.

**Nota de protocolo**: 4 dos 7 confirmados falharam por erro de servidor no momento exato do teste
(2 com a mesma assinatura "manutenção" já vista no Liderar, 1 com HTTP 500 seco, 1 com exceção PHP
fatal). Não dá para descartar nenhum dos 4 como "sem inventário" a partir de uma única tentativa —
precisa reteste em outro horário antes de decidir integrar ou não.

## Achado 2 — novo cluster: Kenlo (API JSON própria, pronta para integração)

CDN `img.kenlo.io`/`static-sites.kenlo.io`/`www.kenlo.com.br` apareceu em 2 sites sem relação
comercial aparente: **JMC Imóveis** e **Luxus Imóveis Premium**. Kenlo é uma SaaS de
site+CRM imobiliário (produto de terceiro, análogo à Universal Software/Imoview, mas plataforma
diferente).

Sondagem via `probe.ts --url` na home de JMC capturou 6 chamadas XHR reais, todas para
`https://www.jmcimoveisbh.com.br/api/listings/<filtro>?...` — endpoint **no próprio domínio do
cliente** (mesmo padrão arquitetural do Imoview: cada site tem seu próprio proxy da API da
plataforma, não uma API central compartilhada).

Confirmação isolada via `curl`, sem sessão/cookies, mesmo método usado no cluster Imoview:

- **Sem sessão**: `GET /api/listings/a-venda?com-fotos=true&expand=1&pagina=1` respondeu 200 com
  JSON estruturado (`{data, count, aggs, title, self}`) nos dois sites, sem nenhum header além do
  default do `curl`.
- **BH confirmada**: `data[].city` = `"Belo Horizonte"` em ambos — diferente do cluster Imoview,
  aqui não há passo de resolução de cidade por código; o filtro de cidade já vem implícito no
  tenant (cada site parece já vir escopado à cidade do cliente).
- **Paginação real confirmada no servidor**: `pagina=1` e `pagina=2` devolveram conjuntos de `url`
  sem nenhuma sobreposição (0 de 12 items repetidos) — não é cosmético.
- **Inventário**: JMC 215 imóveis à venda, Luxus 939 imóveis à venda — ambos justificam coleta
  própria.
- **Contrato mapeado e comparado entre os dois sites**: item de Luxus é um superconjunto exato dos
  campos do item de JMC (`property_tax`, `condo_description`, `has_simulator`, `condo_name`,
  `condo_fees` só em Luxus) — mesma variação "campo opcional presente quando aplicável" já vista no
  cluster Imoview (`valorcondominio`), não uma divergência de contrato. Campos centrais idênticos
  nos dois: `sale_price`, `rent_price`, `property_type`, `bedrooms`, `bathrooms`, `garages`, `area`,
  `neighborhood`, `city`, `url`, `updated_at`, `photos[]`.

**Decisão de arquitetura recomendada: Opção B (cliente HTTP direto), mesmo raciocínio do Imoview** —
não foi necessário Playwright em nenhum momento desta verificação. Um `kenlo-client.ts` análogo a
`imoview-client.ts` cobre os dois sites confirmados e qualquer outro cliente Kenlo encontrado depois
(mesmo ganho de escala do cluster Imoview).

**Pendências antes de integrar**: mapear `property_type`/`amenities` (vocabulário próprio, ainda não
comparado contra `RawListingItem`), confirmar filtro de `aluguel` (só `a-venda` foi testado a fundo)
e decidir se o parâmetro de paginação tem teto conhecido (não testado além da página 2). Nenhum
teste de robots.txt/bloqueio anti-bot foi feito ainda para este cluster.

## Achado 3 — cluster de template compartilhado sem API: "GTM Capital / Loft Sites"

CDN `cdn.loftsites.com.br`/`grupo.loft.com.br`/`loft-analytics.gtmcapital.com.br` apareceu em **8
sites**: Casa Pampulha Imóveis, Habitar Pampulha, Modelo Imóvel, Primer Imóveis, Real Imóveis
Pampulha, Seven Imóveis, TOPMIG Imóveis, Venda Nova Imóveis. O maior agrupamento encontrado neste
diagnóstico — mas **sem endpoint de dados reutilizável**, diferente de Imoview/Kenlo.

Sondagem via `probe.ts --url` contra a página `/busca` de Casa Pampulha: `requisicoesRede: []` (zero
chamadas XHR/fetch), `estruturaDados.hasNextData: false`, `hasInitialState: false` — a listagem é
100% renderizada no HTML inicial, confirmado por `curl` puro (12 cards `/imovel/...` já presentes na
resposta sem JavaScript, mesmo resultado em Habitar Pampulha).

Comparação de classes CSS entre Casa Pampulha e Habitar Pampulha (dois domínios sem relação
comercial): ~30 de ~63 classes idênticas — confirma template compartilhado (mesmo produto de
site-building), não coincidência.

**Decisão de arquitetura**: não há Opção B aqui. Precisa de `CheerioCrawler` fazendo parsing de DOM
puro — mas, como o template é compartilhado, um único conjunto de seletores CSS provavelmente cobre
os 8 sites (a confirmar por site, não presumir — mesmo cuidado de "não presumir contrato entre
sites parecidos" do plano original). Nenhuma paginação numerada foi confirmada ainda (12 itens
visíveis por carga, mecanismo de "próxima página" não investigado).

## Achado 4 — segundo cluster de template compartilhado: ImobiBrasil

CDN `imobibrasil.app.br`/`cdn-imobibrasil.com.br`/`www.imobibrasil.com.br` apareceu em **2 sites**:
Lima Imóveis Barreiro e Strutural Imobiliária, ambos com link de listagem em `/buscar`. Sondagem via
`probe.ts --url` em Strutural: mesma situação do Achado 3 — zero XHR, sem `__NEXT_DATA__`, só um
`JSON-LD` do tipo `RealEstateAgent` (dados institucionais, não listagem). Mesma decisão de
arquitetura: `CheerioCrawler` com seletores próprios, sem API a reaproveitar.

## Sites sem sinal de agrupamento (6) — Nível 1 feito, Nível 3/4 pendente

Nenhum sinal repetido de rodapé/CDN encontrado com outro site da lista: Imobiliária Pampulha, Chave
Certa Imóveis BH, GSA Ativos, Simplifica Imóveis BH, Stilo Netimóveis, e **Casa Mineira** (o
`curl` do Nível 1 recebeu HTTP 403 — bloqueio de user-agent simples, não anti-bot real: resondado
via `probe.ts` com navegador completo, respondeu 200 normalmente, título correto). Cada um precisa
do ciclo completo Nível 3 (achar página de listagem, sondar com `probe.ts --url`, classificar em um
dos 4 casos do plano) individualmente — não feito neste diagnóstico por serem, de fato, plataformas
isoladas sem hipótese de reaproveitamento.

## Bloqueado — Lemos Imóveis

HTTP 406 tanto via `curl` simples quanto via `probe.ts` (Playwright, navegador completo,
`bloqueio.blocked: false` mas `titulo: "Erro 601"`) — não é o bloqueio anti-bot padrão que
`extractPageSignals` reconhece (Cloudflare/captcha), é um erro de aplicação específico do site.
Precisa inspeção manual (talvez IP allowlist, talvez exigir header específico) antes de prosseguir.

## My Broker Diamond — ainda sem URL

Não investigado nesta rodada (fora do escopo do Nível 1, que trabalha só sobre `sites.json`) —
continua precisando da etapa prévia descrita no plano original (buscar a URL pelo nome da empresa)
antes de entrar em qualquer pipeline de diagnóstico.

## Resumo por status (30 imobiliárias)

| Status                                                              | Quantidade | Sites                                                                                                                                    |
| ------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Pronto para integração (mesmo processo do Casa Grande)              | 1          | AdimóveisBH                                                                                                                              |
| Confirmado Imoview, revisitar erro de servidor                      | 4          | Diego Garcia, Valore, IVI Invista, Real Imobiliária                                                                                      |
| Confirmado Imoview, sem inventário/backend funcional em BH          | 2          | MG Galpões, BH Brokers                                                                                                                   |
| Descartado (footer Universal Software, mas 404 no produto)          | 3          | Carlos Imóveis, Só Galpões, Imóvel Certo BH                                                                                              |
| Novo cluster Kenlo, API confirmada, pronto p/ desenho de integração | 2          | JMC Imóveis, Luxus Imóveis Premium                                                                                                       |
| Cluster de template sem API (GTM Capital/Loft Sites)                | 8          | Casa Pampulha, Habitar Pampulha, Modelo Imóvel, Primer Imóveis, Real Imóveis Pampulha, Seven Imóveis, TOPMIG Imóveis, Venda Nova Imóveis |
| Cluster de template sem API (ImobiBrasil)                           | 2          | Lima Imóveis Barreiro, Strutural Imobiliária                                                                                             |
| Sem sinal de agrupamento, Nível 3/4 pendente                        | 6          | Imobiliária Pampulha, Chave Certa Imóveis BH, GSA Ativos, Simplifica Imóveis BH, Stilo Netimóveis, Casa Mineira                          |
| Bloqueado (erro de aplicação, não anti-bot padrão)                  | 1          | Lemos Imóveis                                                                                                                            |
| Sem URL conhecida                                                   | 1          | My Broker Diamond                                                                                                                        |

## Riscos e pontos em aberto para o time

- **Termos de Uso**: nenhum foi lido neste diagnóstico, mesma pendência já registrada em
  `imoview-diagnostico.md` — agora amplificada por mais 2 plataformas novas (Kenlo, e os dois
  clusters de template).
- **4 dos 7 sites Imoview "confirmados" falharam por erro de servidor na hora do teste** — decisão
  de reteste (quando, quantas tentativas) antes de descartar de vez fica em aberto.
- **Kenlo**: só 2 de N sites possíveis foram encontrados nesta rodada de 29 — não foi feita uma
  busca dedicada por mais clientes Kenlo fora da lista original de `sites.json`.
- **Clusters de template (Loft Sites, ImobiBrasil) não têm o mesmo ganho de escala que Imoview/Kenlo**:
  cada site ainda precisa de seletores CSS próprios validados individualmente, mesmo com template
  compartilhado — o reaproveitamento é estrutural (mesma classe de scraper), não de contrato de
  dados.

## Próximo passo (fora desta tarefa)

1. Retestar os 4 sites Imoview com erro de servidor (Diego Garcia, Valore, IVI Invista, Real
   Imobiliária) em outro horário antes de decidir integrar ou descartar.
2. Desenhar e implementar `kenlo-client.ts` (JMC + Luxus) — maior prioridade de integração nova
   depois do AdimóveisBH, mesmo padrão de plano/implementação já usado para Casa Grande.
3. Integrar AdimóveisBH ao cluster Imoview existente — não precisa de plano novo, é o mesmo processo
   já validado 3 vezes (Buritis, Liderar, Casa Grande), e o contrato já bateu sem ajuste.
4. Escolher 2 sites do cluster Loft Sites para validar se um único conjunto de seletores CSS cobre
   os 8, antes de decidir se vale escrever um `CheerioCrawler` compartilhado ou 8 scrapers
   independentes.
5. Completar Nível 3/4 dos 6 sites sem agrupamento + investigar o bloqueio de Lemos Imóveis +
   achar a URL de My Broker Diamond.
