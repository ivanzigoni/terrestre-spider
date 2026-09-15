export function parseMoneyToCents(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) : null;
  }
  const digitsOnly = value.trim().replace(/[^\d,.-]/g, '');
  if (digitsOnly === '') return null;

  const normalized = digitsOnly.includes(',')
    ? digitsOnly.replace(/\./g, '').replace(',', '.')
    : normalizeDotOnly(digitsOnly);

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

// Sem vírgula, um ponto pode ser separador de milhar ("R$ 1.100" = 1100) ou decimal
// ("0.02" vindo de uma API). Milhar brasileiro sempre agrupa em blocos de exatamente 3
// dígitos; um valor decimal em reais nunca tem 3 casas — por isso o número de dígitos
// depois do último ponto desambigua os dois casos.
function normalizeDotOnly(digitsOnly: string): string {
  const groups = digitsOnly.split('.');
  const looksLikeThousands =
    groups.length > 1 && groups.slice(1).every((group) => group.length === 3);
  return looksLikeThousands ? groups.join('') : digitsOnly;
}
