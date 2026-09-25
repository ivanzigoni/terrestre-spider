# Diagnóstico: anúncios sem bairro processado

Data: 24-09-2026

Resultado da execução do plano em `discovery/plano-diagnostico-normalizacao-bairro.md`. Base: banco
de produção, somente leitura, avistamento mais recente de cada anúncio, mais o HTML/JSON bruto das
capturas, lido do armazenamento de objetos.

## 1. Resumo

Anúncios cujo avistamento mais recente não tem `enderecos` tipo `processado`: **1.838** de 18.170.

| Grupo                                                       | Anúncios | Ação           |
| ----------------------------------------------------------- | -------- | -------------- |
| Outro município (cidade bruta ou extraída do texto)         | 1.324    | Fora de escopo |
| Sem bairro bruto, causa no dado processado ou no parser (A) | 351      | Ver seção 3    |
| Bairro bruto presente e não casou com `bairros` (B)         | 163      | Ver seção 4    |

O grupo A de 464, medido antes, incluía 113 anúncios de outros municípios (OLX 110, Lima Imóveis
Barreiro 3), removidos aqui.

## 2. Achado principal

De 351 anúncios do grupo A, **336 são recuperáveis** sem mudar a tabela `bairros` nem o LLM:

- 106 só com reprocessamento (o parser atual já extrai o bairro; o dado foi processado com versão
  anterior).
- 215 com correção de parser, seguida de reprocessamento.
- 13 exigem usar o slug da URL ou o título (o bairro não está no dado estruturado).
- 2 sem bairro no anúncio (ZAP 1, Lima 1).
- Os 15 restantes do grupo A são do My Broker de outros municípios (Nova Lima 13, Lagoa Santa 1,
  São Miguel dos Milagres 1), que passam a ser fora de escopo depois do reprocessamento.

## 3. Grupo A (351) por causa

Teste feito: o parser atual foi executado sobre a captura bruta de cada anúncio.

| Origem                   | Anúncios | Causa                                                                                                                              | Recuperável                      |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| my_broker_belo_horizonte | 106      | Processado com parser antigo. O parser atual extrai o bairro do meta description em 106 de 106                                     | 91 (15 são de outros municípios) |
| stilo_netimoveis         | 15       | Mesma causa: parser atual extrai                                                                                                   | 15                               |
| stilo_netimoveis         | 22       | Parser não lê o bairro que está no corpo da página (e no slug da URL)                                                              | 22, exige correção               |
| casa_mineira             | 142      | O bloco ld+json `VideoObject` vem antes do imóvel e é escolhido no lugar dele. O bloco `House`/`Apartment` com o bairro é ignorado | 142 (138 casam com `bairros`)    |
| casa_mineira             | 12       | ld+json do imóvel com endereço vazio. O bairro só existe no slug da URL                                                            | 12 via slug                      |
| imovelweb                | 2        | Mesma causa do `VideoObject` (template compartilhado com a Casa Mineira)                                                           | 2                                |
| imovelweb                | 1        | ld+json com bairro vazio; o bairro está no título e na URL                                                                         | 1 via título                     |
| imobiliaria_pampulha     | 21       | Parser só lê bairro se o título tiver "vaga". Os títulos variam ("à venda Barroca com...", "no Centro", "Bairro Vale do Jatobá")   | 21, exige correção               |
| gsa_ativos               | 28       | Endereço no corpo em formato sem separador " - " ("Avenida do Contorno, Gutierrez Belo Horizonte")                                 | 28, exige correção               |
| zap_imoveis              | 1        | Galpão anunciado só com localização em nível de cidade                                                                             | Não                              |
| lima_imoveis_barreiro    | 1        | Cidade desconhecida, não investigado                                                                                               | Não confirmado                   |

Taxa de casamento com `bairros` (match exato, depois de remover sufixo entre parênteses):

- My Broker 91 e Stilo 15 (parser atual): 106 de 106.
- Casa Mineira (bloco ld+json correto): 138 de 142. Não casam: "Ana Lúcia (Venda Nova)", "Belo Horizonte",
  "Pampulha", "Xodó Marize".
- Não medida para Imobiliária Pampulha, gsa_ativos, Stilo (22) e Imovelweb, porque dependem da
  correção do parser.

## 4. Grupo B (163) por causa

Em todas as origens do grupo B, o parser atual reproduz exatamente o valor gravado no banco. Não há
dado antigo aqui: o problema é o valor extraído ou a ausência do nome na tabela.

| Origem                                                                         | Anúncios | Causa                                                                                                                                                         |
| ------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gsa_ativos                                                                     | 22       | O parser grava o número do imóvel como bairro ("457", "150", "252")                                                                                           |
| gsa_ativos                                                                     | 5        | UF ou cidade no campo bairro ("MG", "BH/MG", "Belo Horizonte/MG.", "Floramar, Belo Horizonte")                                                                |
| gsa_ativos                                                                     | 29       | O campo traz "bairro, cidade" com cidade de outro município ("São Damião, Vespasiano", "Vale do Sereno, Nova Lima"). Deveria ser tratado como outro município |
| gsa_ativos                                                                     | 8        | "Vale do Sereno" sem cidade. Não verificado se é de BH                                                                                                        |
| casa_mineira                                                                   | 10       | Anúncio sem bairro. O ld+json e o slug trazem só "Belo Horizonte"                                                                                             |
| casa_mineira                                                                   | 28       | Nomes que não estão em `bairros` (Pampulha 18, Estrela Dalva, Sinimbu, Vila Amaral etc.)                                                                      |
| quinto_andar, viva_real, zap_imoveis, olx, primer_imoveis                      | 47       | Nomes informais ou regionais ("Pampulha", Sinimbu, São Gotardo, Incofindência). Todos têm lat/lng                                                             |
| demais origens (ivi, jmc, chave_certa, casa_grande, lima, diego_garcia, stilo) | 14       | Nomes que não estão em `bairros`, sem lat/lng                                                                                                                 |

"Pampulha" aparece em 37 anúncios de 9 origens. É o nome da regional, sem bairro homônimo na tabela.

## 5. Pontos de atenção

- O grupo F (1.211 anúncios de outro município com bairro bruto) usa o campo `cidade` do próprio
  parser. Não foi confirmado por fonte independente.
- Os slugs de URL podem divergir da página. Na Stilo, o anúncio 9672 tem slug "noroeste-joao-pinheiro"
  e o corpo da página diz "Dom Cabral". Usar slug como fonte exige validação.
- O cache do LLM tem 478 entradas, 396 como "não identificado". Um valor em cache nunca é
  reavaliado.
- O processamento só trata capturas pendentes. Nenhuma correção alcança o histórico sem uma rotina de
  reprocessamento.
- A tabela `bairros` é de nível bairro oficial (487). Nomes informais e regionais só se resolvem por
  alias, lat/lng (47 anúncios do B) ou regra própria.

## 6. Correções implementadas

Validação: parsers novos executados sobre as 627 capturas afetadas, mais a camada determinística
contra `bairros`.

| Mudança                                                                              | Efeito medido                                                                                |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Template Imovelweb ignora `VideoObject` e, sem bairro no ld+json, usa título ou slug | Casa Mineira A: 154 de 154 extraem bairro; Imovelweb: 3 de 3                                 |
| Imobiliária Pampulha lê o bairro de títulos em vários formatos                       | 21 de 21 extraem bairro                                                                      |
| GSA: novo parser de endereço livre (`gsa-ativos-endereco.ts`), com cidade, UF e CEP  | 25 de 28 do grupo A (os 3 restantes não têm bairro no endereço) e correção dos 64 do grupo B |
| Stilo lê o bairro quando o texto é só "bairro cidade"                                | 37 de 37 extraem bairro                                                                      |
| `normalizarBairro` recebe a cidade e não casa bairro de anúncio de outro município   | Evita casar nome de bairro de outra cidade com bairro de BH                                  |
| Rotina `reprocessar-geografia` (dry-run por padrão)                                  | Aplica as correções ao histórico                                                             |

Estimativa sobre os 627 (só camada determinística, antes de qualquer chamada ao LLM): 345 resolvem,
165 são de outros municípios, 5 não têm bairro no dado e 112 têm nome que não está em `bairros`.

Achado adicional: cerca de 250 anúncios de outros municípios (Contagem 93, Betim 40, Santa Luzia 28,
Vespasiano 15 e outros) já têm bairro de BH processado, porque o casamento era só por nome. A
opção `--corrigir-outros-municipios` da rotina lista e, com `--aplicar`, remove esses vínculos.

Uso, na raiz do projeto:

- `npm run reprocessar:geografia` executa em dry-run, sem gravar e sem chamar o LLM.
- `npm run reprocessar:geografia -- --aplicar` grava.
- `--origem=<origem>` restringe a uma origem; `--corrigir-outros-municipios` inclui a correção acima.

## 7. Ordem sugerida de correção

1. Rotina de reprocessamento do histórico (destrava 106 anúncios sem mudar código de parser).
2. Parser Casa Mineira/Imovelweb: ignorar `VideoObject` (destrava 144, 138 já validados).
3. Parser Imobiliária Pampulha (21), gsa_ativos (28 + 22 do B), Stilo (22).
4. Tratamento de "bairro, cidade" no gsa_ativos e classificação como outro município (29 + 8).
5. Decisão sobre lat/lng para os 47 anúncios do B com coordenadas, e sobre uma tabela de aliases.
