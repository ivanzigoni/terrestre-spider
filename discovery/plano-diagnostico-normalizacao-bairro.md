# Plano de diagnóstico: normalização de bairro no processamento das capturas brutas

Data: 24-09-2026

Documento autocontido para execução em outra sessão, sem depender do histórico da conversa que o
originou. Cobre só a metodologia e o escopo. A execução (rodar queries, ler resultados, decidir
correções) fica para quem abrir este arquivo depois.

## 1. Objetivo

Todo anúncio cujo dado bruto traz o nome do bairro deve resolver contra a tabela `bairros`. O
diagnóstico mede quantos anúncios com bairro bruto presente ficam sem bairro processado, por que
isso acontece e quanto cada correção candidata recupera.

Métrica: fração dos anúncios com bairro bruto presente que não têm linha `processado` em
`enderecos`, por origem. Sintoma visível hoje: anúncios exibidos como "Endereço não informado" na
listagem de aluguel do Terra em Foco.

Fora de escopo: anúncios cujo parser já devolve `bairro` nulo (problema de extração por origem,
frente separada) e anúncios de outros municípios (irrecuperáveis por definição, saem do
denominador).

## 2. Como o processamento resolve o bairro hoje

Fluxo em `src/processing/main.ts` e `src/processing/geografia/`:

- O parser da origem devolve a string `bairro`. Só ela alimenta a resolução; `endereco`, `cep`,
  `latitude`, `longitude` e `descricao` são gravados, mas não participam.
- `normalizarBairro` retorna "sem resultado" imediatamente se `bairro` é nulo ou vazio.
- Camada determinística (`normalizar-bairro-deterministico.ts`): match exato pela chave
  normalizada (sem acento, maiúsculas, espaços colapsados) testando 4 candidatos: a string
  original, sem sufixo entre parênteses, duplicação "X - X" colapsada e primeiro segmento antes de
  " - ". Sem fuzzy e sem tabela de aliases.
- Camada LLM (`inferidor-bairro-deepseek.ts`): classifica o texto entre os bairros da tabela. O
  resultado só vale se o nome bate exatamente com um bairro da lista e a confiança é no mínimo 0.6.
- Cache (`bairros_llm_cache`): guarda toda inferência bem-sucedida, inclusive `NAO_IDENTIFICADO` e
  confiança baixa. Um valor em cache nunca é reavaliado. Erros de chamada não são cacheados.
- Só capturas `PENDENTE` são processadas. O script `backfill-geografia-llm.ts` apenas preenche o
  cache e não atualiza anúncios já processados.
- `avistamentos.bairro_id` existe, mas o processamento grava só `regionalId`. O bairro processado
  vive em `enderecos` com `tipo = 'processado'`.

Consequência: uma melhoria de regra, prompt ou limiar não altera o histórico sem um reprocessamento
dedicado.

## 3. Fases

### Fase 1. Baseline (somente leitura)

- Universo: anúncios cujo avistamento mais recente tem `enderecos` original com `bairro` não nulo,
  excluídos os de outro município.
- Numerador: os que não têm `enderecos` tipo `processado`.
- Cortes: origem, tipo de transação, tipo de imóvel.
- Contar à parte as capturas em status `ERRO`, que nem chegam a virar anúncio.

### Fase 2. Classificação por causa

Cada valor bruto distinto não resolvido cai em um bucket:

- B: determinístico falhou e não há entrada no cache (o LLM nunca rodou).
- C: cache com `NAO_IDENTIFICADO`.
- D: cache com confiança menor que 0.6.
- E: cache resolvido, mas fora da referência (desalinhamento de nome).

Ranking dos valores por número de anúncios afetados (Pareto).

### Fase 3. Padrões de falha nos valores do topo

Amostra manual dos valores mais frequentes, classificando em:

- Ruído de formato: prefixo "Bairro", sufixo de cidade ou UF, vírgulas, abreviações ("Sta", "S."),
  numerais.
- Typos.
- Nome popular contra nome oficial.
- Mais de um bairro na mesma string.
- Sub-bairro, condomínio ou loteamento.
- Lixo de extração.

Para cada padrão, o conserto candidato: regra determinística, fuzzy por distância de edição, tabela
de aliases ou ajuste de prompt.

### Fase 4. Validação de precisão

- Golden set de cerca de 200 valores brutos rotulados à mão.
- Medir acurácia e cobertura de três camadas: determinístico atual, determinístico com fuzzy e
  aliases, e LLM.
- Revisar amostra dos buckets C e D para separar erro do LLM de valor irrecuperável.
- Calibrar o limiar de confiança (hoje 0.6).

### Fase 5. Simulação offline

- Script somente leitura em `src/scripts/` aplicando as regras candidatas aos valores distintos.
- Saída: quantos anúncios cada regra recupera, sem alterar o banco.

### Fase 6. Relatório

Documento em `discovery/` com a tabela de causas por origem, o ranking de intervenções (ganho e
risco), a meta realista e a recomendação de reprocessamento do histórico.

## 4. Critério de conclusão

- Baseline por origem publicado.
- Cada bucket com causa explicada e amostra que a sustenta.
- Cada correção candidata com ganho estimado em anúncios e acurácia medida no golden set.
- Decisão registrada sobre reprocessar o histórico.
