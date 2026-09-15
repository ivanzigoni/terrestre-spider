function extractPushedStrings(html: string): string[] {
  const marker = 'self.__next_f.push([1,';
  const results: string[] = [];
  let searchFrom = 0;

  for (;;) {
    const markerIndex = html.indexOf(marker, searchFrom);
    if (markerIndex === -1) break;

    let cursor = markerIndex + marker.length;
    while (cursor < html.length && html[cursor] !== '"') cursor++;
    const quoteStart = cursor;
    cursor++;

    let escapeNext = false;
    while (cursor < html.length) {
      const char = html[cursor];
      if (escapeNext) {
        escapeNext = false;
      } else if (char === '\\') {
        escapeNext = true;
      } else if (char === '"') {
        break;
      }
      cursor++;
    }
    const quoteEnd = cursor;

    const literal = html.slice(quoteStart, quoteEnd + 1);
    results.push(JSON.parse(literal) as string);
    searchFrom = quoteEnd + 1;
  }

  return results;
}

function findBalancedObject(text: string, objectStart: number): string {
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = objectStart; i < text.length; i++) {
    const char = text[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return text.slice(objectStart, i + 1);
    }
  }

  throw new Error(
    `objeto RSC a partir da posição ${String(objectStart)} não fechou corretamente`,
  );
}

/**
 * Extrai um objeto JSON embutido no payload de streaming RSC do Next.js
 * (`self.__next_f.push([1, "..."])`), localizando `"<key>":{...}` no texto
 * concatenado de todos os chunks e devolvendo o objeto parseado.
 *
 * O mesmo nome de chave pode aparecer mais de uma vez no payload como valor
 * primitivo (ex.: metatag Open Graph serializada como `{"property":"og:title"}`,
 * colidindo textualmente com uma chave `"property":{...}` de negócio) — por
 * isso cada ocorrência só é aceita se o primeiro caractere não-espaço depois
 * dos dois-pontos for `{`; caso contrário a busca segue para a próxima.
 */
export function extractRscObject(html: string, key: string): unknown {
  const combined = extractPushedStrings(html).join('');
  const marker = `"${key}":`;

  let searchFrom = 0;
  for (;;) {
    const markerStart = combined.indexOf(marker, searchFrom);
    if (markerStart === -1) {
      throw new Error(`objeto da chave "${key}" não encontrado no payload RSC`);
    }

    let objectStart = markerStart + marker.length;
    while (/\s/.test(combined.charAt(objectStart))) {
      objectStart++;
    }

    if (combined.charAt(objectStart) === '{') {
      return JSON.parse(findBalancedObject(combined, objectStart));
    }

    searchFrom = markerStart + marker.length;
  }
}
