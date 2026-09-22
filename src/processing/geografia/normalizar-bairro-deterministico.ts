import type { DataSource } from 'typeorm';

import { BairroRegional } from '../../persistence/entities/bairro-regional.entity.js';

export interface ReferenciaBairro {
  bairroId: number;
  bairro: string;
  regionalId: number;
}

export type ResultadoNormalizacaoDeterministica = ReferenciaBairro;

export function normalizarChave(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function removerSufixoRegional(valor: string): string {
  const semEspacos = valor.trim();
  if (!semEspacos.endsWith(')')) return semEspacos;
  const aberturaIndex = semEspacos.lastIndexOf('(');
  return aberturaIndex === -1
    ? semEspacos
    : semEspacos.slice(0, aberturaIndex).trim();
}

function colapsarDuplicacao(valor: string): string | null {
  const partes = valor.split(' - ');
  if (partes.length !== 2) return null;
  const [primeira, segunda] = partes;
  if (primeira === undefined || segunda === undefined) return null;
  return normalizarChave(primeira) === normalizarChave(segunda)
    ? primeira.trim()
    : null;
}

function primeiroSegmento(valor: string): string | null {
  const partes = valor.split(' - ');
  const primeira = partes[0];
  return partes.length >= 2 && primeira !== undefined ? primeira.trim() : null;
}

export function normalizarBairroDeterministico(
  bairroBruto: string,
  referencia: ReadonlyMap<string, ReferenciaBairro>,
): ResultadoNormalizacaoDeterministica | null {
  const candidatos = [
    bairroBruto,
    removerSufixoRegional(bairroBruto),
    colapsarDuplicacao(bairroBruto),
    primeiroSegmento(bairroBruto),
  ];

  for (const candidato of candidatos) {
    if (candidato === null) continue;
    const encontrado = referencia.get(normalizarChave(candidato));
    if (encontrado !== undefined) return encontrado;
  }

  return null;
}

export async function carregarReferenciaBairros(
  dataSource: DataSource,
): Promise<Map<string, ReferenciaBairro>> {
  const linhas = await dataSource
    .getRepository(BairroRegional)
    .find({ relations: { bairro: true } });
  const referencia = new Map<string, ReferenciaBairro>();
  for (const linha of linhas) {
    referencia.set(normalizarChave(linha.bairro.nome), {
      bairroId: linha.bairroId,
      bairro: linha.bairro.nome,
      regionalId: linha.regionalId,
    });
  }
  return referencia;
}
