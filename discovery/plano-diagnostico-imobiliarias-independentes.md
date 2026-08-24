# Plano de diagnóstico — imobiliárias independentes de BH (fora do cluster Imoview)

Data: 23-08-2026

Documento autocontido para execução em outra sessão, sem depender do histórico da conversa que o
originou. Cobre só a metodologia e o escopo — a execução (rodar scripts, ler resultados, decidir
integração) fica para quem abrir este arquivo depois.

## 1. Contexto

O cluster Universal Software/Imoview (18 candidatos apontados em
`.claude/__workdir/pesquisa-crawl/03-aprofundamento-imobiliarias-bh.md`) já foi totalmente
resolvido: 3 integradas (Imobiliária Buritis, Liderar Imóveis, Casa Grande Imóveis — ver
`discovery/imoview-diagnostico.md`), 15 descartadas com evidência direta (13 testadas nesta rodada
sem confirmar o backend Imoview no domínio próprio, mais Imobiliária Barreiro — é Arbo Imóveis — e
Administrar Imóveis — é Imoview, mas sem cobertura de BH). Não há mais trabalho pendente dentro
desse cluster.

Restam **30 imobiliárias independentes** catalogadas em `src/discovery/sites.json` (categoria
`imobiliaria`) sem nenhum diagnóstico de plataforma feito — nem sequer a URL da página de
listagem/busca de cada uma é conhecida hoje, só a home. Cada uma é, em princípio, uma plataforma
distinta (CMS/CRM imobiliário próprio ou de terceiro não identificado) — diferente do cluster
Imoview, aqui não há uma hipótese de plataforma compartilhada a validar de partida.

Fora de escopo deste plano, deliberadamente: os 5 sites de leilão e os 8 de temporada catalogados
no mesmo `sites.json` (categorias `leilao`/`temporada`) — são um tipo de fonte diferente (edital/
disponibilidade por data, não inventário de venda/aluguel contínuo) e não fazem parte da mesma
frente de trabalho.

## 2. Escopo — as 30 imobiliárias

| #   | Nome                              | URL                                     | Inventário declarado (doc 03)             |
| --- | --------------------------------- | --------------------------------------- | ----------------------------------------- |
| 1   | AdimóveisBH                       | https://www.adimoveisbh.com.br/         | mais de 800 imóveis                       |
| 2   | Diego Garcia Imóveis              | https://www.diegogarciaimoveis.com.br/  | mais de 800 imóveis                       |
| 3   | Valore Imóveis                    | https://www.valoreimoveis.com.br/       | mais de 800 imóveis                       |
| 4   | MG Galpões                        | https://www.mggalpoes.com.br/           | mais de 300 imóveis                       |
| 5   | Imobiliária Pampulha              | https://imobiliariapampulha.com.br/     | "centenas de imóveis"                     |
| 6   | Só Galpões                        | https://www.sogalpoes.com.br/           | não quantificado; atua há mais de 40 anos |
| 7   | BH Brokers Imóveis                | https://www.bhbrokersimoveis.com.br/    | não declarado                             |
| 8   | Carlos Imóveis                    | https://www.carlosimoveisltda.com.br/   | não declarado                             |
| 9   | Casa Mineira                      | https://www.casamineira.com.br/         | não declarado                             |
| 10  | Casa Pampulha Imóveis             | https://casapampulhaimoveis.com.br/     | não declarado                             |
| 11  | Chave Certa Imóveis BH            | https://www.chavecertaimoveisbh.com.br/ | não declarado                             |
| 12  | GSA Ativos                        | https://gsaativos.com.br/               | não declarado                             |
| 13  | Habitar Pampulha                  | https://habitarpampulha.com.br/         | não declarado                             |
| 14  | IVI Invista Imóveis               | https://invistaimoveismg.com.br/        | não declarado                             |
| 15  | Imóvel Certo BH                   | https://www.imovelcertobh.com.br/       | não declarado                             |
| 16  | JMC Imóveis                       | https://www.jmcimoveisbh.com.br/        | não declarado                             |
| 17  | Lemos Imóveis                     | https://www.lemosimoveis.com.br/        | não declarado                             |
| 18  | Lima Imóveis Barreiro             | https://www.limaimoveisbarreiro.com.br/ | não declarado                             |
| 19  | Luxus Imóveis Premium             | https://www.luxusimoveis.com.br/        | não declarado                             |
| 20  | Modelo Imóvel                     | https://modeloimovel.com.br/            | não declarado                             |
| 21  | Primer Imóveis                    | https://grupoprimerimoveis.com.br/      | não declarado                             |
| 22  | Real Imobiliária                  | https://www.realimobiliaria.com.br/     | não declarado                             |
| 23  | Real Imóveis Pampulha             | https://realimoveisbh.com.br/           | não declarado                             |
| 24  | Seven Imóveis                     | https://sevenimoveis.com.br/            | não declarado                             |
| 25  | Simplifica Imóveis BH             | https://simplificaimoveisbh.com.br/     | não declarado                             |
| 26  | Stilo Netimóveis                  | https://www.stilonetimoveis.com.br/     | não declarado                             |
| 27  | Strutural Imobiliária             | https://struturalimoveis.com.br/        | não declarado                             |
| 28  | TOPMIG Imóveis                    | https://topmig.com.br/                  | não declarado                             |
| 29  | Venda Nova Imóveis / Nova Imóveis | https://vendanovaimoveis.com.br/        | não declarado (códigos ~5900 vistos)      |
| 30  | My Broker Diamond                 | **sem URL em sites.json**               | não declarado                             |

Ordem da tabela já reflete a priorização recomendada (seção 6): as 6 primeiras linhas têm
inventário declarado relevante (>300 imóveis ou "centenas"), maior retorno esperado por esforço de
diagnóstico. As 23 seguintes não têm nenhum sinal de porte e devem ser tratadas em lote, sem
prioridade individual entre si. My Broker Diamond precisa de uma etapa prévia (achar a URL) antes
de entrar no pipeline — não bloqueia as outras 29.

## 3. Por que não dá para reaproveitar o método do cluster Imoview direto

O método que resolveu Buritis/Liderar/Casa Grande partiu de uma hipótese forte (mesma plataforma,
mesmo endpoint, confirmada por rodapé + CDN) e validou/generalizou a partir de 2-3 sites piloto.
Aqui não há hipótese de partida: são 30 plataformas presumivelmente distintas. Duas lições da
rodada anterior continuam valendo e mudam a ordem dos passos:

- **O sinal de rodapé sozinho não confirma nada** (13 dos 14 candidatos "confirmados no rodapé"
  Universal Software não eram Imoview de verdade). Qualquer sinal de plataforma encontrado aqui
  serve só para _agrupar_ candidatos a testar juntos, nunca para decidir integração sem teste
  direto do endpoint.
- **A home page não revela o endpoint de dados** — só a página de listagem/busca revela, porque é
  ali que o carregamento assíncrono de imóveis acontece. `src/discovery/sites.json` só tem a URL
  da home para essas 30 (diferente de Buritis/Liderar, que já tinham a URL de listagem catalogada
  antes do diagnóstico Imoview). Descobrir essa URL por site é o primeiro trabalho real deste
  plano, não um dado já disponível.

## 4. Metodologia — 4 níveis, com critério de parada em cada um

### Nível 1 — reconhecimento estático (todas as 30, sem Playwright, barato)

Para cada site, via `curl` simples (sem sessão, sem navegador):

1. Baixar a home (`curl -s <url>` para arquivo). Extrair:
   - Texto de rodapé/crédito de desenvolvimento ("Desenvolvido por X", "Powered by X", "Criado
     por X") — registrar o texto bruto, sem presumir qual produto é.
   - Qualquer domínio de CDN de imagens/assets que não seja do próprio site (`grep -o` por
     `src="https://[^"]*"` e olhar os domínios únicos) — é o tipo de sinal que confirmou o cluster
     Imoview (`cdn.imoview.com.br`) e pode reaparecer aqui com um domínio diferente.
   - O link de navegação para a página de listagem/busca (texto tipo "Comprar", "Alugar",
     "Imóveis à venda", "Buscar imóvel", ícone de lupa) — extrair o `href` completo. **Esta é a
     informação mais importante do Nível 1**: sem ela, não dá para chegar ao Nível 3.
2. Baixar `robots.txt` (`curl -s <origin>/robots.txt`). Registrar `Disallow` relevantes para
   qualquer path de busca/listagem (mesmo antes de saber qual é esse path — revisar de novo depois
   de achar a URL de listagem no passo 1).
3. Registrar tudo numa tabela (CSV ou markdown) com colunas: nome, url home, url listagem
   candidata, rodapé/crédito bruto, domínio(s) de CDN externo encontrado(s), robots relevante.

Critério de parada aqui: nenhuma URL de listagem encontrada na home (nem por link direto nem por
busca no HTML por padrões comuns tipo `/venda`, `/aluguel`, `/imoveis`, `/busca`) → marcar como
"requer inspeção manual" e seguir para o próximo, não travar o lote nisso.

### Nível 2 — agrupamento por sinal repetido

Depois do Nível 1 nas 30, comparar as colunas de rodapé/crédito e de CDN externo entre todos os
sites. Qualquer sinal (texto de rodapé igual, ou mesmo domínio de CDN) repetido em **2 ou mais
sites sem relação comercial aparente** é candidato a plataforma compartilhada — mesmo raciocínio
que validou o cluster Imoview ("duas imobiliárias independentes com o mesmo padrão é evidência de
plataforma, não de coincidência de fornecedor de site", `discovery/imoview-diagnostico.md`).

- Se surgir um grupo de 2+: tratar esse grupo com prioridade — testar 2 membros dele primeiro no
  Nível 3/4; se confirmado, o mesmo cliente HTTP passa a cobrir o grupo inteiro, replicando
  exatamente o ganho de escala do cluster Imoview.
- Sites sem nenhum sinal repetido (esperado ser a maioria dos 30) seguem individualmente para o
  Nível 3, sem hipótese de agrupamento prévia.

### Nível 3 — sondagem dinâmica da página de LISTAGEM (não da home)

Aqui entra a ferramenta de probe já existente no projeto (`src/discovery/probe.ts`), com uma
limitação a resolver antes de usar: ela só aceita como alvo um site já catalogado em `sites.json`
pelo nome (`--only <nome>` ou `--only pilot`), e usa o campo `url` (home) daquele registro — não
tem hoje como apontar para uma URL de listagem avulsa sem editar `sites.json`.

**Duas opções, escolher uma antes de começar o Nível 3:**

- **Opção simples (sem mexer em código):** para cada site com URL de listagem encontrada no Nível
  1, adicionar uma entrada extra em `src/discovery/sites.json` (mesmo padrão já usado para Buritis/
  Liderar: `"Imobiliária Buritis - Listagem Venda"`), e rodar `npx tsx src/discovery/probe.ts
--only "<nome> - Listagem"` um site de cada vez.
- **Opção com pequena extensão de código:** adicionar um flag `--url <url completa>` em
  `probe.ts` (função `main`), que monta um `DiscoverySite` avulso (`{ nome: 'ad-hoc', url,
categoria: 'imobiliaria' }`) sem precisar editar `sites.json` a cada site — mais rápido para 30
  sites, mesmo formato de saída (`discovery/output/ad-hoc.json`, sobrescrito a cada rodada, então
  renomear/mover o arquivo entre execuções se quiser manter o histórico).

Qualquer uma das duas produz o mesmo `ProbeResult` (`src/discovery/types.ts`) já usado nos
diagnósticos anteriores: `requisicoesRede` (até 40 chamadas XHR/fetch capturadas durante a
navegação — é aqui que aparece qualquer endpoint candidato a dado real), `estruturaDados`
(`__NEXT_DATA__`, JSON-LD, `__INITIAL_STATE__` — sinal de front-end moderno com dado embutido no
HTML, sem precisar de endpoint separado), `robots`, `bloqueio` (Cloudflare/captcha), `paginacao`,
mais screenshot.

Ler o resultado de cada site e classificar em um destes 4 casos:

1. **`requisicoesRede` tem uma chamada XHR/fetch clara para um endpoint de dados** (URL com cara de
   API, método POST/GET com parâmetros de busca) → candidato forte, vai para o Nível 4.
2. **`estruturaDados.hasNextData` ou `hasInitialState` é `true`** → o dado já vem embutido no HTML
   inicial (padrão Next.js/similar), sem precisar de chamada de API separada — mesma situação do
   OLX (`__NEXT_DATA__`) documentada em
   `.claude/__workdir/pesquisa-crawl/05-especificacao-tecnica-scraping-lote1.md`. Candidato a
   `CheerioCrawler` direto na página de listagem, parseando o JSON embutido — arquitetura diferente
   da API/JSON do cluster Imoview, mas ainda mais simples que scraping de DOM puro.
3. **Nenhuma chamada relevante e nenhum dado embutido, mas os cards de imóvel aparecem no
   `bodyTextSample`/screenshot** → listagem 100% server-rendered em HTML puro. Único caminho aqui é
   parsing de DOM (`CheerioCrawler` + seletores CSS específicos do site) — sem reuso entre sites,
   cada um exige seu próprio `routes.ts`, ao contrário dos casos 1 e 2.
4. **`bloqueio.blocked: true`** (Cloudflare, captcha, "just a moment") já na listagem → registrar e
   deprioritizar; qualquer caminho de integração aqui carrega custo extra de evasão, fora do escopo
   de um diagnóstico rápido.

### Nível 4 — confirmação isolada do endpoint (só para o caso 1 do Nível 3)

Mesmo método usado para confirmar Buritis/Liderar/Casa Grande: replicar a chamada via `curl`
isolado, **sem cookies, sem sessão de navegador**, com os mesmos parâmetros vistos na captura de
rede do Nível 3. Confirmar, nesta ordem (parar no primeiro "não"):

1. O endpoint responde com o mesmo dado real fora do navegador? Se não, tentar replicar headers
   (`Referer`, `Origin`, `X-Requested-With`, `Accept`) antes de concluir que precisa de navegador
   real (caso Liderar). Se mesmo assim não passar, a fonte exige variante Playwright
   (`createImoviewBrowserRun`-like, adaptado ao contrato específico do site) — mais lento, só vale
   se o inventário justificar.
2. A cidade/filtro de Belo Horizonte está disponível nesse cliente? (não presumir — o caso
   Administrar Imóveis mostrou uma plataforma confirmada sem nenhum imóvel em BH).
3. A paginação é real no servidor (páginas diferentes devolvem itens diferentes)?
4. Mapear o contrato de campos contra `RawListingItem`
   (`src/persistence/raw-listing-item.ts`) — preço, área, quartos, banheiros, vagas,
   localização, link de detalhe, data de publicação. Registrar qualquer campo ausente ou com nome/
   tipo diferente do já visto (mesmo cuidado que revelou `valoranterior` como número no Casa
   Grande) — não presumir que o contrato bate só porque a plataforma parece a mesma de outro site
   já visto.

Site que passa nos 4 pontos: candidato pronto para virar fonte nova, seguindo o mesmo padrão de
integração já estabelecido (`OrigemAnuncio` + migration + `main.ts` + wiring em `src/main.ts`) —
não repetir aqui o desenho da integração em si, é o mesmo processo já usado para Casa Grande.

## 5. Scripts descartáveis — mesma disciplina do diagnóstico anterior

Qualquer script de apoio escrito durante a execução deste plano (inspeção pontual de uma resposta,
teste de payload reduzido, etc.) deve seguir o padrão já usado neste projeto: viver em
`discovery/tmp-<nome-descritivo>.ts`, nunca commitado, apagado assim que a pergunta que motivou o
script for respondida. `discovery/imoview-diagnostico.md` documenta o mesmo padrão
(`tmp-capture-imoview-endpoint.ts`, já apagado).

## 6. Priorização recomendada

1. As 6 imobiliárias com inventário declarado relevante (linhas 1-6 da tabela da seção 2) —
   maior retorno esperado por esforço de diagnóstico.
2. Qualquer grupo de 2+ sites que o Nível 2 revelar com sinal compartilhado — mesmo ganho de escala
   do cluster Imoview, mesmo que nenhum membro do grupo esteja entre os 6 prioritários.
3. As 23 restantes sem sinal de porte, em qualquer ordem — tratar em lote, sem gastar tempo
   decidindo ordem entre elas.
4. My Broker Diamond por último: primeiro achar a URL (busca simples pelo nome + "Belo Horizonte
   imóveis"), só depois entra no pipeline dos outros 29.

## 7. Cuidados operacionais

- **Rate limit por site**: mesmo cuidado do crawler de produção
  (`SAME_DOMAIN_DELAY_SECS = 3` em `src/sources/shared/crawler-defaults.ts`) — no diagnóstico,
  isso significa não disparar múltiplas requisições contra o mesmo domínio em sequência apertada,
  mesmo em fase exploratória. `probe.ts` já tem um delay de 4s entre sites diferentes
  (`DELAY_BETWEEN_SITES_MS`) quando rodado em lote — preservar isso, não reduzir para acelerar.
- **robots.txt é sinal técnico, não decisão jurídica**: registrar o que ele diz (mesmo padrão dos
  diagnósticos anteriores), mas não é o critério de decidir integração — isso já ficou
  registrado como pergunta em aberto para o time em `discovery/imoview-diagnostico.md` ("Termos de
  Uso por imobiliária, não por portal") e continua valendo aqui, ainda mais amplificado (30 Termos
  de Uso distintos, não 1 por portal). Este plano cobre só a viabilidade técnica.
- **Não presumir contrato entre sites "parecidos"**: mesmo dentro de um grupo do Nível 2, cada
  membro precisa passar pelo Nível 4 individualmente antes de entrar em produção — o cluster
  Imoview teve 5 sites testados e 3 variações de contrato confirmadas (`valorcondominio` ausente
  ora num ora noutro, `valortratado` ausente em aluguéis do Liderar, `valoranterior` como número no
  Casa Grande). Não há razão para esperar menos variação aqui, com plataformas presumivelmente mais
  diversas ainda.

## 8. Entregável esperado ao final da execução

- Uma tabela/CSV com o resultado do Nível 1 para as 30 (rodapé, CDN, URL de listagem encontrada,
  robots relevante).
- Um novo documento `discovery/<nome>-diagnostico.md` (ou um por grupo de plataforma confirmado, se
  o Nível 2 revelar mais de um cluster) registrando o que passou pelos Níveis 3-4, no mesmo formato
  de `imoview-diagnostico.md`: achados, decisão de arquitetura (API direta vs. HTML embutido vs.
  scraping de DOM vs. Playwright), riscos e pendências para o time.
- Uma lista final de candidatos prontos para integração (mesmo processo de
  `discovery/imoview-diagnostico.md` → implementação do Casa Grande) e uma lista de descartados com
  o motivo registrado (mesmo padrão usado para Imobiliária Barreiro/Administrar Imóveis) — para que
  ninguém repita o mesmo teste depois achando que o site ainda está pendente.
