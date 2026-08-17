import type { Dataset } from 'crawlee';
import { log } from 'crawlee';
import type { DataSource } from 'typeorm';

import { Imovel } from './entities/imovel.entity.js';
import { ObservacaoPreco } from './entities/observacao-preco.entity.js';
import { TipoTransacao } from './enums/tipo-transacao.enum.js';
import type { RawListingItem } from './raw-listing-item.js';

// Para venda, somar iptu/condominio ao preço não representa nada de real (preço de
// compra + custo mensal recorrente); totalPrice só faz sentido como "custo total" no
// aluguel. Em ambos os casos iptu/condominio continuam gravados, só não entram na soma.
function calcularTotalPrice(
  item: Pick<
    RawListingItem,
    'transactionType' | 'price' | 'iptu' | 'condominio'
  >,
): number {
  if (item.transactionType === TipoTransacao.VENDA) return item.price;
  return item.price + item.iptu + item.condominio;
}

/**
 * Lê o Dataset inteiro já populado pela fase Extract e upserta em `imoveis`
 * (por `link`), gravando também uma observação de preço append-only por item.
 * Cada item da execução compartilha o mesmo `scrapedAt`.
 */
export async function loadIntoPostgres(
  dataset: Dataset<RawListingItem>,
  dataSource: DataSource,
): Promise<void> {
  const scrapedAt = new Date();
  let inseridos = 0;
  let atualizados = 0;

  await dataset.forEach(async (item) => {
    const totalPrice = calcularTotalPrice(item);

    await dataSource.transaction(async (manager) => {
      const imovelRepository = manager.getRepository(Imovel);
      const existente = await imovelRepository.findOneBy({ link: item.link });

      const imovel =
        existente ??
        imovelRepository.create({
          link: item.link,
          firstSeenAt: scrapedAt,
        });

      imovel.title = item.title;
      imovel.bedrooms = item.bedrooms;
      imovel.bathrooms = item.bathrooms;
      imovel.parkingSpots = item.parkingSpots;
      imovel.area = item.area;
      imovel.location = item.location;
      imovel.origin = item.origin;
      imovel.transactionType = item.transactionType;
      imovel.propertyType = item.propertyType;
      imovel.datePostedText = item.datePostedText;
      imovel.currentPrice = item.price;
      imovel.currentIptu = item.iptu;
      imovel.currentCondominio = item.condominio;
      imovel.currentTotalPrice = totalPrice;
      imovel.oldPrice = item.oldPrice;
      imovel.active = true;
      imovel.lastSeenAt = scrapedAt;

      const imovelSalvo = await imovelRepository.save(imovel);

      if (existente === null) {
        inseridos += 1;
      } else {
        atualizados += 1;
      }

      const observacaoRepository = manager.getRepository(ObservacaoPreco);
      await observacaoRepository.save(
        observacaoRepository.create({
          imovel: imovelSalvo,
          price: item.price,
          iptu: item.iptu,
          condominio: item.condominio,
          totalPrice,
          scrapedAt,
        }),
      );
    });
  });

  log.info(
    `load: ${String(inseridos)} imóvel(is) novo(s), ${String(atualizados)} atualizado(s)`,
  );
}
