const CARACTERES_DE_BORDA = new Set([' ', ',', '.', '-', '–', ':']);

export function aparar(valor: string): string {
  let inicio = 0;
  let fim = valor.length;
  while (inicio < fim && CARACTERES_DE_BORDA.has(valor.charAt(inicio))) {
    inicio++;
  }
  while (fim > inicio && CARACTERES_DE_BORDA.has(valor.charAt(fim - 1))) {
    fim--;
  }
  return valor.slice(inicio, fim);
}

export function normalizarEspacos(valor: string): string {
  return valor.replace(/\s+/g, ' ').trim();
}
