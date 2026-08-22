# Diagnóstico — cluster Universal Software/Imoview (imobiliárias regionais de BH)

Data: 22-08-2026

Diagnóstico de viabilidade para adicionar, como fonte, o cluster de imobiliárias regionais de BH
que rodam sobre a plataforma Universal Software/Imoview — apontado como prioridade 1 em
`.claude/__workdir/pesquisa-crawl/03-aprofundamento-imobiliarias-bh.md` (maior concentração
confirmada de imobiliárias sobre uma mesma plataforma: ~18 nomes com sinal de rodapé
"Desenvolvido por Universal Software"). Este documento não implementa a fonte — mesmo papel que
`quintoandar-diagnostico.md` cumpriu antes da implementação do Quinto Andar: reduzir uma futura
tarefa de implementação à decisão de arquitetura, sem repetir a exploração.

Diferença de escopo em relação aos outros diagnósticos deste projeto: aqui o alvo não é um único
site, é uma plataforma compartilhada por dezenas de imobiliárias independentes. A pergunta central
não é só "dá para coletar este site", é "um único adaptador cobre todos eles".

Evidência bruta:

- `discovery/output/imobiliaria-buritis.json`, `discovery/output/liderar-imoveis.json` — sondagens
  antigas (16-08-2026), só da home de cada site.
- `discovery/output/imobiliaria-buritis-listagem-venda.json`,
  `discovery/output/liderar-imoveis-listagem-venda.json` — sondagens novas (22-08-2026), contra as
  páginas de listagem reais, feitas para este diagnóstico.

## Sites usados como piloto

Dos ~18 nomes que o doc 03 associa à Universal/Imoview, dois foram escolhidos para validar a
hipótese de plataforma compartilhada antes de expandir para o restante: **Imobiliária Buritis**
(sinal mais forte no doc 03 — CDN `cdn.imoview.com.br` explícita) e **Liderar Imóveis** (sinal
"forte indício", não confirmação explícita de rodapé). São duas imobiliárias sem relação
comercial aparente entre si, o que torna qualquer padrão comum entre as duas evidência de
plataforma, não de coincidência de fornecedor de site.

URLs de listagem confirmadas por sondagem direta (nenhuma estava registrada em nenhum lugar do
código antes deste diagnóstico):

- Buritis: `https://www.imobiliariaburitis.com.br/venda/imovel/belo-horizonte`
- Liderar: `https://www.liderarimoveis.com.br/venda/imovel/belo-horizonte`

Mesmo path (`/venda/imovel/belo-horizonte`) responde 200 nos dois domínios independentes — primeiro
sinal concreto de padrão de URL compartilhado, além do que o doc 03 já indicava por rodapé.

## Achado central: mesmo endpoint AJAX nos dois sites

A listagem de imóveis **não vem no HTML servido** (`hasNextData: false` nas quatro sondagens,
`jsonLdCount: 1` e sempre o mesmo schema `Organization` — não `Product`/`RealEstateListing` por
imóvel). Um `curl` sem JavaScript contra a página de listagem do Buritis devolveu 1181 linhas de
HTML sem nenhum card de imóvel visível (nenhuma ocorrência de "Código" — campo que aparece nos
cards renderizados pelo navegador, conforme `bodyTextSample` da sondagem via Playwright). A
listagem depende de JavaScript.

A sondagem via Playwright contra a página de listagem real capturou as chamadas de rede, e o mesmo
endpoint aparece nos dois sites, com o mesmo nome exato:

```
POST https://www.imobiliariaburitis.com.br/retornar-imoveis-disponiveis
POST https://www.liderarimoveis.com.br/retornar-imoveis-disponiveis
```

Junto de outros endpoints também compartilhados nominalmente entre os dois sites
(`retornar-cidades-disponiveis`, `retornar-bairros-disponiveis`, `retornar-parametros-gerais`,
`retornar-parametros-url`, `get-condominios`, `retornar-tipos-disponiveis`,
`retornar-destaques`, `retornar-favoritos`) — o mesmo conjunto de rotas internas, com os mesmos
nomes em português, em dois domínios sem relação comercial. Isso é evidência de código de
front-end compartilhado (mesmo template/plataforma), bem mais forte do que o sinal documental do
doc 03 (rodapé + CDN).

**Atualização — gap fechado.** O probe formal (`src/discovery/probe.ts`) só registra
`method`/`url`/`resourceType` de cada requisição (`src/discovery/types.ts`,
`NetworkRequestSample`), não corpo de requisição/resposta. Um script à parte
(`discovery/tmp-capture-imoview-endpoint.ts`, descartável, apagado após este diagnóstico) foi
escrito especificamente para capturar isso, interceptando a resposta real da chamada disparada
pela própria página. Resultado nas duas próximas seções.

## Confirmação: `/retornar-imoveis-disponiveis` funciona sem sessão de navegador

O corpo da requisição disparada pela própria página, capturado via interceptação de rede, é um
form `application/x-www-form-urlencoded` (não JSON) — mesmo conjunto de campos nos dois sites
(`finalidade`, `codigocidade`, `numeropagina`, `numeroregistros`, `ordenacao`,
`cidades[codigo]`/`cidades[nome]`, `condominio[codigo]` etc.), com pequenas diferenças de campos
opcionais entre Buritis e Liderar (ex.: `retornomapaapp`, `codigoempreendimentomae` só aparecem em
um dos dois).

Replicado com `curl` isolado, sem nenhum cookie e sem qualquer contexto de navegador — mesmo
método de verificação aplicado à API do Quinto Andar (`quintoandar-diagnostico.md`):

- **Confirmado sem sessão**: a chamada isolada devolveu HTTP 200 com JSON estruturado, e o
  primeiro item da lista bateu exatamente com o que a sondagem via Playwright havia capturado
  (mesmo `codigo: 32444`, mesmo `titulo`, mesma primeira foto) — não é um dado diferente por não
  ter sessão, é o mesmo dado real.
- **Payload reduzido também funciona**: uma segunda chamada com só 6 campos do form (`finalidade`,
  `codigocidade`, `numeropagina`, `numeroregistros`, `ordenacao`, `cidades[codigo]`/`cidades[nome]`)
  devolveu resposta válida — a maioria dos campos do form completo tem valor-padrão no servidor.
- **Paginação real confirmada no servidor**, não cosmética: `numeropagina=2` devolveu códigos de
  imóvel diferentes de `numeropagina=1` (`34611, 34700, 32499, ...` vs `32444, 34078, 34713, ...`)
  — ao contrário do Quinto Andar, aqui a paginação não depende de nenhuma chamada adicional de
  API só para navegar, o parâmetro já está no mesmo POST que traz os dados.
- A resposta também traz `quantidade`/`total_registros` (contagem total de imóveis do filtro
  aplicado) — Liderar reportou 1025-1032 imóveis à venda em BH, Buritis 1312, dependendo do filtro
  usado no teste — confirma que o inventário de cada imobiliária individual já é grande o
  suficiente para justificar coleta própria, não só agregação via portal.

Isso resolve o item mais importante em aberto do diagnóstico original: **não há necessidade de
Playwright para extrair dados** — um cliente HTTP simples, sem gerenciar cookies/sessão, já
reproduz o mesmo resultado que um navegador real.

## Mapeamento de campos (`RawListingItem`)

Baseado na resposta real de `/retornar-imoveis-disponiveis` (item completo inspecionado da
resposta do Buritis — 32 campos por imóvel, mais um array `fotos` e um array `captadores`).

| `RawListingItem`                        | Campo no Imoview                                                                                                                                                       | Observação                                                                                                                                                                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `origin`                                | fixo (fora de escopo deste diagnóstico)                                                                                                                                | decisão de modelagem ainda em aberto — ver "Riscos"                                                                                                                                                                                             |
| `transactionType`                       | `codigofinalidade` — **confirmado**: `1` = aluguel, `2` = venda                                                                                                        | testado com `finalidade=aluguel` explícito e comparado ao `codigofinalidade` devolvido                                                                                                                                                          |
| `propertyType`                          | `tipo` (já em português: `"Apartamento"`)                                                                                                                              | igual ao Quinto Andar, não precisa mapear vocabulário                                                                                                                                                                                           |
| `link`                                  | **gap fechado**: `https://<domínio>/imovel/{url_amigavel}/{codigo}`                                                                                                    | confirmado de duas formas: (1) padrão encontrado no `sitemap.xml` do Buritis para outros imóveis; (2) URL montada manualmente para o item já inspecionado (`código 32444`) respondeu HTTP 200 com o mesmo código presente 60× no HTML da página |
| `title`                                 | `titulo`                                                                                                                                                               | mapeamento direto                                                                                                                                                                                                                               |
| `bedrooms`, `bathrooms`, `parkingSpots` | `numeroquartos`, `numerobanhos`, `numerovagas`                                                                                                                         | vêm como string numérica (`"2"`), precisa `Number()`                                                                                                                                                                                            |
| `area`                                  | `areainterna` (string formato BR, ex. `"60,00"`) ou `areaprincipaltratado` (inteiro, ex. `6000`)                                                                       | `areaprincipaltratado` parece ser a área × 100 sem separador decimal — não confirmado por fórmula, só por comparação de exemplo; decisão de qual campo usar fica para a implementação                                                           |
| `location`                              | `bairro` + `cidade` + `estado` (+ `latitude`/`longitude` disponíveis)                                                                                                  | mais rico que os adaptadores atuais, que não têm lat/long                                                                                                                                                                                       |
| `datePostedText`                        | `datahoracadastro`                                                                                                                                                     | **resolve um gap que o Quinto Andar não resolveu** — aqui o campo existe e veio preenchido (`"2026-01-30 11:13:43"`)                                                                                                                            |
| `price`                                 | `valortratado` (inteiro, sem separador) ou `valor` (string formatada `"R$ 590.000,00"`)                                                                                | usar `valortratado`, mesmo padrão do `areaprincipaltratado`                                                                                                                                                                                     |
| `oldPrice`                              | `valoranterior`                                                                                                                                                        | **resolve outro gap que o Quinto Andar não resolveu** — campo existe nativamente; veio vazio (`""`) no único exemplo inspecionado, não confirma se é preenchido quando há redução de preço                                                      |
| `iptu`, `condominio`                    | **inconsistente entre sites do mesmo cluster** — o item do Liderar trazia `valorcondominio`, o item do Buritis inspecionado não trouxe nenhum campo de condomínio/IPTU | acompanha o padrão já visto no request (campos opcionais variam por site); um adaptador único precisa tratar ausência, não presumir presença                                                                                                    |

Cobertura de dados sensivelmente melhor que a API pública do Quinto Andar: `datePostedText` e
`oldPrice`, os dois gaps que ficaram em aberto naquele diagnóstico, existem nativamente aqui — mas
o gap de `link` (URL de detalhe) é novo e não existia lá.

## Paginação

O clique em filtros durante a sondagem do Buritis expôs a URL final navegada pelo cliente:

```
.../venda/imovel/belo-horizonte/todos-os-bairros/?&pagina=1&ordenacao=dataatualizacaodesc
```

O parâmetro `pagina=N` na URL é só reflexo cosmético do estado da página (`history.pushState`,
mesmo padrão do Quinto Andar) — a paginação real, confirmada por teste direto, vive no campo
`numeropagina` do corpo do POST a `/retornar-imoveis-disponiveis` (ver seção anterior), não na
URL. Diferente do Netimóveis (`?pagina=N` na URL dispara nova busca server-side) e também
diferente do Quinto Andar (paginação via `offset`/API separada da URL de busca) — aqui é uma
terceira variação: paginação real, mas embutida no mesmo POST que já traz os dados, não um
parâmetro de URL nem uma chamada auxiliar.

`paginacao.hasNumberedPagination: false` e `hasNextLink: false` nas quatro sondagens — mas isso é
esperado: os sinais de paginação de `src/discovery/extract.ts` procuram elementos DOM (links
numerados, `rel="next"`), e aqui a paginação passa por AJAX, não por links — mesma limitação que
o diagnóstico do Quinto Andar já registrou para o campo `disallowedForTargetPath` com query
string.

## robots.txt e postura de bloqueio

Idêntico nos dois sites, nas quatro sondagens:

- `robots.disallowedForTargetPath: false` — robots.txt só desautoriza páginas de
  agradecimento/formulário (`/imovel-nao-encontrado/`, `/obrigado-imovel-ideal/`,
  `/contato-obrigado/` etc.), nenhuma delas no caminho de listagem/busca planejado.
- `bloqueio.blocked: false` nas quatro sondagens — nenhum padrão de bloqueio conhecido
  (`src/discovery/probe.ts:33-38`) disparado, nenhum redirecionamento para checkpoint/captcha.
- Nenhum indício de Cloudflare ou desafio anti-bot nos `consoleErros` capturados (só erros 410
  de recursos pontuais, não relacionados a bloqueio).

Isso cobre o aspecto técnico. **Não cobre** os Termos de Uso de cada site individualmente — doc 03
registra "robots/Termos não confirmados" para praticamente todas as entradas do cluster, e este
diagnóstico não alterou isso: nenhum Termos de Uso foi lido ainda. Diferente de um portal grande
(um único Termos de Uso cobre milhões de anúncios), aqui cada imobiliária tem seu próprio Termos —
uma decisão de escala sobre quanto ler antes de estender o adaptador para as ~16 imobiliárias
restantes do cluster é uma pergunta para o time, não só para engenharia (mesma categoria do risco
já registrado no diagnóstico do Quinto Andar sobre `apigw.prod.quintoandar.com.br` sem
`robots.txt`).

## API Imoview documentada — não confundir com o endpoint acima

A Universal mantém uma **API Imoview** oficial (`api.imoview.com.br`), documentada, autenticada por
um header `chave` (citada no doc 03, seção "Assinaturas técnicas prioritárias"). Isso é diferente
do endpoint `/retornar-imoveis-disponiveis` encontrado aqui: aquele é um produto comercial
separado, cuja documentação pública não deixa claro se a chave é autoatendida (como o App Manager
do Mercado Livre) ou depende de contrato com a Universal Software por cliente. Não foi
investigado neste diagnóstico — fica como alternativa a comparar contra a Opção B abaixo, não
como caminho já avaliado.

## Decisão de arquitetura: Opção B (cliente HTTP direto), confirmada

Ao contrário do Quinto Andar (onde a Opção B ficou registrada como recomendação, não decisão
fechada), aqui a verificação por `curl` isolado (seção "Confirmação" acima) já elimina a
alternativa Playwright como necessária para a extração:

- Sem sessão, sem cookies, sem cabeçalhos além de `Content-Type`: `/retornar-imoveis-disponiveis`
  responde com o mesmo dado real que a página mostra.
- Paginação já embutida no mesmo POST — nenhuma chamada auxiliar de API só para navegar entre
  páginas (diferente do que a Opção A precisaria fazer de qualquer forma, misturando DOM scraping
  com chamada de API só para paginar — o mesmo argumento que pesou a favor da Opção B no Quinto
  Andar).
- Reaproveitável entre as ~18 imobiliárias do cluster: mesmo cliente HTTP, mesmo parsing de
  resposta, mudando só o domínio-base por imobiliária — a vantagem de escala que o doc 03 aponta
  como motivo de priorizar este cluster, agora com evidência técnica, não só documental.

Playwright (Opção A) não é necessário para a extração de dados deste cluster. Pode ainda ser
necessário para uma etapa isolada e pontual — descobrir o padrão de URL de detalhe do imóvel (ver
gap de `link` na tabela de campos) — mas não para a coleta de listagens em si.

## Terceiro site testado: uma confirmação e uma correção ao doc 03

Para reduzir a amostra de 2 para 3 antes de generalizar (item pendente do "Próximo passo"
original), dois candidatos adicionais do doc 03 foram testados diretamente:

**Imobiliária Barreiro — não é Imoview, é Arbo Imóveis.** O doc 03 já registrava esse nome com
ressalva ("por padrão de site, embora a confirmação explícita não tenha sido localizada"). Teste
direto confirma que a ressalva estava certa a se desconfiar: `robots.txt` aponta sitemap em
`barreiroimob.site.arboimoveis.com.br` (não `imoview`), e `/retornar-imoveis-disponiveis` no
domínio da Barreiro devolve o HTML genérico do shell AngularJS do site (`ng-app=arboWeb`), não o
JSON do Imoview. **Correção ao doc 03**: Imobiliária Barreiro deve ser removida do grupo
Universal/Imoview — é outra plataforma (Arbo Imóveis), fora do escopo deste diagnóstico.

**Administrar Imóveis — confirma a plataforma, mas não a cobertura de BH.** Diferente da Barreiro,
aqui `/retornar-imoveis-disponiveis` respondeu com o mesmo envelope JSON exato
(`{"lista":[...],"quantidade":N,"favoritos":[...]}`) e fotos servidas em
`cdn.imoview.com.br/administrar/Imoveis/...` — confirmação direta de que é Imoview (terceiro site
independente com o mesmo contrato de API). Mas `codigocidade=1` (Belo Horizonte para Buritis e
Liderar) devolveu um imóvel em Itaúna/MG para este cliente, e a consulta a
`retornar-cidades-disponiveis` mostrou que **Belo Horizonte não aparece na lista de cidades deste
cliente** — o catálogo dele cobre outras ~55 cidades de MG/SP/BA/CE/SE, nenhuma delas BH.
**Correção ao doc 03**: a entrada "Administrar Imóveis... BH; administração, condomínios, venda e
aluguel" não reflete o inventário atual consultado diretamente via API — ao menos hoje, este
cliente não tem imóveis em BH.

**Achado de protocolo, não específico de um site**: `codigocidade` é um código **local ao cliente**
Imoview, não uma tabela global compartilhada pela plataforma — cada imobiliária tem seu próprio
catálogo de cidades, com seus próprios números. Um adaptador não pode fixar `codigocidade=1` como
"Belo Horizonte" para qualquer site do cluster (funcionou por coincidência nos dois primeiros); é
preciso, para cada imobiliária, chamar `retornar-cidades-disponiveis` primeiro e casar por
`nome`/`nomeurlamigavel` (`"belo-horizonte"`) antes de montar a chamada a
`retornar-imoveis-disponiveis`. Isso também significa que uma parte do cluster do doc 03 pode,
como a Administrar, não ter nenhum imóvel em BH hoje — algo que só a chamada direta a
`retornar-cidades-disponiveis` resolve por site, a lista documental não é suficiente.

## Riscos e pontos em aberto para o time (não só engenharia)

- **Termos de Uso por imobiliária, não por portal** — ver seção "robots.txt e postura de
  bloqueio". Decisão de quanto validar antes de escalar para as ~16 imobiliárias restantes do
  cluster.
- **API Imoview oficial não avaliada como alternativa** — se autoatendida, pode ser preferível ao
  endpoint interno reverso (mesmo trade-off que levou o projeto a preferir a API OAuth do Mercado
  Livre a scraping de HTML, quando disponível).
- **Amostra de 3 sites em ~18, e já com uma falsa entrada confirmada no doc 03** — Buritis e
  Liderar confirmam o padrão; Administrar confirma a plataforma mas não a cobertura de BH;
  Barreiro confirma que o doc 03 tinha ao menos um falso-positivo (é Arbo Imóveis, não Imoview).
  Extrapolar para as ~15 entradas restantes do cluster sem testar cada uma individualmente repete
  o mesmo risco — inclusive as marcadas como "confirmado no rodapé" no doc 03, já que a
  Administrar também tinha esse nível de confiança documental e ainda assim não cobre BH hoje.
- **Escala do orquestrador** — mesmo risco já registrado no diagnóstico do Quinto Andar: cada
  imobiliária nova aumenta o tempo total de execução do orquestrador sequencial
  (`src/main.ts:14-19,26-37`); aqui a escala é maior (até ~18 fontes de um só cluster, não uma),
  o que torna essa pergunta mais urgente do que foi para uma fonte isolada.
- **Modelagem de origem no schema** — ainda não decidido: um valor de `OrigemAnuncio` por
  imobiliária (18 valores de enum novos) ou um valor único (`imoview`) com um campo adicional
  identificando a imobiliária. TypeORM já lida com enums Postgres via migration incremental
  (`ALTER TYPE ... ADD VALUE`, ver `src/persistence/migrations/1787177504013-AddMercadoLivreOrigin.ts`
  na worktree `feat/integra-mercado-livre`), mas isso não decide qual das duas modelagens é
  melhor — é uma decisão de schema, fora do escopo deste diagnóstico.

## Implementação do piloto (Buritis + Liderar)

Decisão de modelagem tomada pelo time: um valor de `OrigemAnuncio` por imobiliária (não um valor
único `imoview` com campo adicional), consistente com o padrão já usado pelas outras 5 fontes do
projeto.

Implementado nesta mesma tarefa, reaproveitando o cliente como um módulo único
(`src/sources/shared/imoview-client.ts` + `imoview-router.ts` + `imoview-main.ts`), com cada
imobiliária reduzida a um `main.ts` de ~15 linhas (`src/sources/imobiliaria-buritis/main.ts`,
`src/sources/liderar-imoveis/main.ts`) — confirma na prática a vantagem de escala que motivou
priorizar este cluster: adicionar a segunda imobiliária não duplicou nenhuma lógica de parsing ou
paginação, só `baseUrl`/`origin`/nome de exibição.

**Validação ao vivo (fora dos testes automatizados, contra os sites reais)**: rodei um smoke test
do cliente completo (`resolveCidadeCode` → `buildSearchPayload` → `retornar-imoveis-disponiveis`
real → `parseSearchResponse`) contra os dois sites:

- **Buritis**: sucesso completo — cidade resolvida (`codigo: 1`), 20 itens retornados de um total
  de 1312, primeiro item mapeado corretamente para `RawListingItem` (mesmo `link` já validado
  antes: `.../imovel/apartamento-a-venda-buritis-belo-horizonte-mg/32444`).
- **Liderar**: `resolveCidadeCode` funcionou (expôs também um achado de contrato — ver "Correção
  de contrato" abaixo), mas `/retornar-imoveis-disponiveis` respondeu com `{"error":true,"log":"Curl
failed with error #22: ...500 Internal Server Error", redirect: ".../manutencao"}` de forma
  consistente por mais de 2 horas, para qualquer cliente HTTP (curl, `fetch`, `ImpitHttpClient`),
  mesmo replicando cookie de sessão, `Referer`, `Origin`, `Sec-Fetch-*`, `sec-ch-ua` — o conjunto
  completo de headers de um navegador real. **Inicialmente interpretado como instabilidade real do
  backend do Liderar — estava errado.** Ver "Achado real" abaixo.

**Achado real: não era instabilidade, era bloqueio anti-bot.** Um navegador real (Playwright)
recebia 200 com dados reais no mesmo endpoint, de forma reprodutível — a página do próprio Liderar
sempre funcionou para quem navega normalmente. O bloqueio não é por header: replicar exatamente os
headers que a chamada nativa da página usa (incluindo `X-Requested-With: XMLHttpRequest` e
`Accept: */*`, que `fetch()` não adiciona sozinho, diferente de jQuery) ainda assim falhou quando
disparado manualmente via `page.evaluate` — 0/10 em tentativas consecutivas na mesma sessão de
navegador que tinha acabado de funcionar nativamente segundos antes. A única forma que funciona de
verdade é deixar o JavaScript nativo da própria página disparar a chamada: navegar (página
completa, não `history.pushState`) direto para a URL de listagem com `?pagina=N`, e capturar a
resposta que a página dispara sozinha ao carregar. Buritis não tem essa proteção — mesma
plataforma Imoview, mas comportamento de proteção diferente por imobiliária.

**Implementação da solução**: `src/sources/shared/imoview-browser-router.ts` +
`imoview-browser-main.ts` — variante de `imoview-router.ts`/`imoview-main.ts` que usa
`PlaywrightCrawler` navegando página por página (`?pagina=N` na URL) em vez de um `HttpCrawler`
chamando o endpoint diretamente. Um `preNavigationHooks` registra o listener de resposta antes da
navegação do Crawlee (senão a chamada nativa, disparada assim que a página carrega, já teria
acontecido antes do listener existir). `src/sources/liderar-imoveis/main.ts` usa essa variante;
`src/sources/imobiliaria-buritis/main.ts` continua na variante HTTP rápida. **Validado contra o
banco real**: 443 imóveis novos gravados (43 aluguéis completos + parte de 1025 vendas, limitado
pelo teto de 20 páginas do teste), 20/20 requests concluídas (2 timeouts pontuais de captura de
resposta, recuperados pelo retry automático do Crawlee).

Consequência para o restante do cluster: **cada imobiliária pode precisar da variante HTTP ou da
variante navegador — não dá para assumir uma ou outra a partir da plataforma**. Confirmar qual
delas usar (tentar a HTTP primeiro, cair pra navegador só se necessário) é parte do trabalho de
adicionar cada imobiliária nova, não uma decisão única para o cluster inteiro.

**Correção de contrato #1**: o campo usado para casar o slug de cidade em
`retornar-cidades-disponiveis` não é `nomeurlamigavel` como a exploração inicial assumiu — é
`urlAmigavel`. Os dois campos coexistem no Buritis (mesmo valor), mas o Liderar só expõe
`urlAmigavel`; `nomeurlamigavel` está ausente na resposta dele. O cliente foi implementado usando
`urlAmigavel`, confirmado presente nos três sites testados (Buritis, Liderar, Administrar).

**Correção de contrato #2**: o campo `valortratado` (inteiro pronto, fonte original do `price`) não
existe em anúncios de aluguel do Liderar, só nos de venda — mesmo com `valor` (string formatada)
sempre presente nos dois casos. O cliente foi corrigido para derivar `price` sempre de `valor` via
o mesmo parser BRL já usado em `oldPrice`/`condominio`, nunca de `valortratado`. Também corrigido:
`area` e `price` eventualmente chegam como float da API (ex.: `156.61` m², `1689.5` de aluguel
prorateado) — `Math.round()` aplicado nos dois antes de gravar, já que as colunas são `int`.
`oldPrice` trata tanto string vazia (sentinela do Buritis) quanto `"R$ 0,00"` (sentinela do
Liderar) como "sem valor anterior" (`null`), não como preço zero real.

## Próximo passo (fora desta tarefa)

1. **Verificar `retornar-cidades-disponiveis` (cobertura de BH) individualmente para cada uma das
   ~15 imobiliárias restantes do cluster antes de somá-las à lista de fontes** — o teste com
   Administrar Imóveis mostrou que o rótulo "confirmado no rodapé" do doc 03 garante a plataforma,
   não a cobertura de Belo Horizonte; e o teste com Barreiro mostrou que mesmo o rótulo "indício"
   pode estar errado sobre a própria plataforma. Nenhuma das duas coisas dá para assumir da lista
   documental — o mesmo cliente compartilhado já implementado serve para validar cada uma
   rapidamente (só chamar `resolveCidadeCode` com o `baseUrl` candidato).
2. **Para cada imobiliária nova, testar a variante HTTP primeiro e só cair pra variante navegador
   se o endpoint rejeitar** — a variante navegador é sensivelmente mais lenta (uma navegação de
   página real por página de resultado, ~9s/página observado no Liderar, contra ~2s/página no
   Buritis via HTTP direto).
3. ~~Liderar ainda não tem a seed completa~~ — **feito**. Seed completa das duas fontes, com o
   teto ampliado via `SPIDER_MAX_REQUESTS_PER_CRAWL`: Buritis 1594 imóveis (282 aluguéis + 1312
   vendas), Liderar 1067 imóveis (43 aluguéis + 1024 vendas — 1025 reais menos 1 excluído pelo
   filtro de valor plausível, ver "Correção de contrato #3" abaixo).

**Correção de contrato #3, encontrada rodando a seed completa contra o banco real**: um imóvel do
Liderar (170m², Lourdes) tinha `valor` cadastrado como `"R$ 3.650.000.000,00"` — 3,65 bilhões, no
lugar de `"R$ 3.650.000,00"` — erro de digitação de quem cadastrou o anúncio no Imoview, não um
bug de parsing. `current_price`/`current_condominio`/`old_price` são `int` (int4) no schema, teto
de ~2,147 bilhões — sem filtro, um único anúncio com erro de digitação na fonte derruba o lote
inteiro de upsert (500 itens de uma vez). Adicionado `temValorPlausivel` em `imoview-client.ts`:
descarta silenciosamente (mesmo padrão dos itens que falham o type guard de formato) qualquer item
cujo preço/condomínio/preço anterior exceda o teto do int4 — não é um teto de "preço razoável para
imóvel", é o limite técnico da coluna.
