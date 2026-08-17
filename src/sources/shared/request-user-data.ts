import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';

export interface SourceUserData extends Record<string, unknown> {
  transactionType: TipoTransacao;
}

/**
 * `userData` viaja serializado na RequestQueue entre a request inicial e as de
 * paginação — valida em runtime em vez de confiar cegamente no tipo estático,
 * já que um esquecimento de propagação (`enqueueLinks` sem `userData`) vira
 * `transactionType` errado gravado silenciosamente no banco.
 */
export function getTransactionType(userData: unknown): TipoTransacao {
  if (
    typeof userData === 'object' &&
    userData !== null &&
    'transactionType' in userData &&
    (userData.transactionType === TipoTransacao.ALUGUEL ||
      userData.transactionType === TipoTransacao.VENDA)
  ) {
    return userData.transactionType;
  }
  throw new Error('transactionType ausente ou inválido no userData da request');
}
