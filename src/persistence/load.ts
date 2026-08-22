import type { Dataset } from 'crawlee';
import { log } from 'crawlee';
import type { DataSource, EntityManager } from 'typeorm';

import { BASE_BACKOFF_MS, MAX_BACKOFF_MS } from '../sources/shared/backoff.js';
import { Anuncio } from './entities/anuncio.entity.js';
import { ObservacaoPreco } from './entities/observacao-preco.entity.js';
import { TipoAnuncio } from './enums/tipo-anuncio.enum.js';
import { TipoTransacao } from './enums/tipo-transacao.enum.js';
import type { RawListingItem } from './raw-listing-item.js';

// Quanto maior o lote, menos idas e vindas à rede — cada lote vira 2 queries (upsert de
// anuncios + insert de observacoes_preco), não 4-5 por item. 500 linhas fica bem abaixo do
// limite de parâmetros do Postgres (65535) mesmo com ~19 colunas por linha.
const BATCH_SIZE = 500;
const MAX_BATCH_RETRIES = 2;

// Colunas atualizadas quando o link já existe. Nunca inclui first_seen_at (só faz sentido
// gravado uma vez, na primeira inserção) nem id/link/created_at.
const UPDATE_COLUMNS = [
  'title',
  'bedrooms',
  'bathrooms',
  'parking_spots',
  'area',
  'location',
  'origin',
  'ad_type',
  'transaction_type',
  'property_type',
  'date_posted_text',
  'current_price',
  'current_iptu',
  'current_condominio',
  'current_total_price',
  'old_price',
  'active',
  'last_seen_at',
  'updated_at',
];

interface UpsertedRow {
  id: number;
  link: string;
  inserted: boolean;
}

// Para venda, somar iptu/condominio ao preço não representa nada de real (preço de
// compra + custo mensal recorrente); precoTotal só faz sentido como "custo total" no
// aluguel. Em ambos os casos iptu/condominio continuam gravados, só não entram na soma.
function calcularPrecoTotal(
  item: Pick<RawListingItem, 'tipoTransacao' | 'preco' | 'iptu' | 'condominio'>,
): number {
  if (item.tipoTransacao === TipoTransacao.VENDA) return item.preco;
  return item.preco + item.iptu + item.condominio;
}

/**
 * Upsert em lote via `INSERT ... ON CONFLICT (link) DO UPDATE`, uma query pra até
 * BATCH_SIZE linhas, em vez de um SELECT+INSERT/UPDATE por item. `(xmax = 0)` é o truque
 * padrão do Postgres pra saber, direto no RETURNING, se aquela linha foi inserida agora ou
 * já existia — evita uma query extra só pra contar inseridos/atualizados.
 */
async function upsertBatch(
  manager: EntityManager,
  items: RawListingItem[],
  scrapedAt: Date,
): Promise<{ inseridos: number; atualizados: number }> {
  // Duplicata de link no mesmo lote quebra o ON CONFLICT (Postgres não deixa afetar a
  // mesma linha 2x na mesma statement) — mantém só a última ocorrência de cada link.
  const porLink = new Map<string, RawListingItem>();
  for (const item of items) porLink.set(item.link, item);
  const dedupedItems = [...porLink.values()];

  const values = dedupedItems.map((item) => ({
    link: item.link,
    titulo: item.titulo,
    quartos: item.quartos,
    banheiros: item.banheiros,
    vagas: item.vagas,
    area: item.area,
    localizacao: item.localizacao,
    origem: item.origem,
    // Tudo que chega aqui vem da spider — único produtor deste pipeline hoje — então
    // é sempre um anúncio de imóvel. Ver TipoAnuncio para o motivo da coluna existir.
    tipoAnuncio: TipoAnuncio.IMOVEL,
    tipoTransacao: item.tipoTransacao,
    tipoImovel: item.tipoImovel,
    dataDePublicacaoText: item.dataDePublicacaoText,
    precoAtual: item.preco,
    iptuAtual: item.iptu,
    condominioAtual: item.condominio,
    precoTotalAtual: calcularPrecoTotal(item),
    precoAntigo: item.precoAntigo,
    ativo: true,
    vistoPelaPrimeiraVezEm: scrapedAt,
    vistoPelaUltimaVezEm: scrapedAt,
    updatedAt: scrapedAt,
  }));

  const result = await manager
    .createQueryBuilder()
    .insert()
    .into(Anuncio)
    .values(values)
    .orUpdate(UPDATE_COLUMNS, ['link'])
    .returning('id, link, (xmax = 0) AS inserted')
    .execute();

  const rows = result.raw as UpsertedRow[];

  let inseridos = 0;
  let atualizados = 0;
  const observacoes = rows.map((row) => {
    if (row.inserted) inseridos += 1;
    else atualizados += 1;

    const item = porLink.get(row.link);
    if (item === undefined) {
      throw new Error(
        `load: link retornado pelo upsert não bate com nenhum item do lote: ${row.link}`,
      );
    }
    return {
      anuncio: { id: row.id },
      preco: item.preco,
      iptu: item.iptu,
      condominio: item.condominio,
      precoTotal: calcularPrecoTotal(item),
      raspadoEm: scrapedAt,
    };
  });

  await manager
    .createQueryBuilder()
    .insert()
    .into(ObservacaoPreco)
    .values(observacoes)
    .execute();

  return { inseridos, atualizados };
}

/**
 * Com query_timeout configurado em data-source.ts, um soluço de rede vira erro rápido em
 * vez de travar pra sempre — mas sem retry aqui, um único soluço aborta o lote inteiro.
 * Mesmo formato de backoff exponencial de shared/backoff.ts, reaproveitado em vez de
 * duplicado.
 */
async function upsertBatchWithRetry(
  dataSource: DataSource,
  items: RawListingItem[],
  scrapedAt: Date,
): Promise<{ inseridos: number; atualizados: number }> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await dataSource.transaction((manager) =>
        upsertBatch(manager, items, scrapedAt),
      );
    } catch (error) {
      if (attempt >= MAX_BATCH_RETRIES) throw error;
      const delayMs = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      log.warning(
        `load: lote de ${String(items.length)} item(ns) falhou (tentativa ${String(attempt + 1)}/${String(MAX_BATCH_RETRIES + 1)}), retry em ${String(delayMs)}ms`,
        { error },
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Lê o Dataset inteiro já populado pela fase Extract e upserta em `anuncios` (por `link`) em
 * lotes de BATCH_SIZE, gravando também uma observação de preço append-only por item. Cada
 * item da execução compartilha o mesmo `scrapedAt`.
 */
export async function loadIntoPostgres(
  dataset: Dataset<RawListingItem>,
  dataSource: DataSource,
): Promise<void> {
  const scrapedAt = new Date();
  let inseridos = 0;
  let atualizados = 0;
  let batch: RawListingItem[] = [];

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const resultado = await upsertBatchWithRetry(dataSource, batch, scrapedAt);
    inseridos += resultado.inseridos;
    atualizados += resultado.atualizados;
    batch = [];
  };

  await dataset.forEach(async (item) => {
    batch.push(item);
    if (batch.length >= BATCH_SIZE) {
      await flush();
    }
  });
  await flush();

  log.info(
    `load: ${String(inseridos)} anúncio(s) novo(s), ${String(atualizados)} atualizado(s)`,
  );
}
