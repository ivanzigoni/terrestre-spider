// Converte string no formato "R$ 1.999.999,00" para inteiro em reais, sem centavos —
// confirmado por comparação item a item com o campo `valortratado` (quando presente)
// em discovery/imoview-diagnostico.md. `null` só para string vazia ou não numérica —
// interpretação de "zero" fica a cargo de quem chama (depende do campo: condomínio
// zero é dado real, valor anterior zero normalmente não é, ver `parseValorAnterior`
// em imoview-client.ts).
export function parseBrlToInteiro(valor: string): number | null {
  const trimmed = valor.trim();
  if (trimmed === '') {
    return null;
  }
  const semPrefixo = trimmed.replace(/^R\$\s*/, '').replace(/\./g, '');
  const parteInteira = semPrefixo.split(',')[0];
  const numero = parteInteira === undefined ? NaN : Number(parteInteira);
  return Number.isNaN(numero) ? null : numero;
}
