import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';

export interface SourceUserData extends Record<string, unknown> {
  tipoTransacao: TipoTransacao;
}

/**
 * `userData` viaja serializado na RequestQueue entre a request inicial e as de
 * paginação — valida em runtime em vez de confiar cegamente no tipo estático,
 * já que um esquecimento de propagação (`enqueueLinks` sem `userData`) vira
 * `tipoTransacao` errado gravado silenciosamente no banco.
 */
export function getTipoTransacao(userData: unknown): TipoTransacao {
  if (
    typeof userData === 'object' &&
    userData !== null &&
    'tipoTransacao' in userData &&
    (userData.tipoTransacao === TipoTransacao.ALUGUEL ||
      userData.tipoTransacao === TipoTransacao.VENDA)
  ) {
    return userData.tipoTransacao;
  }
  throw new Error('tipoTransacao ausente ou inválido no userData da request');
}
