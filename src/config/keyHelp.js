/**
 * What to say when a config object has a key it should not: the key it most likely meant, and the keys there are.
 * No zod here, so the loader, the scene checks and the editor can all word it the same way.
 */

/** Edit distance between two short strings (Levenshtein). */
export function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

/** The known name a misspelt one most likely means, or null: two slips away at most (one for a very short name), whatever the case. */
export function closest(name, known) {
  let best = null, least = Infinity;
  for (const k of known) {
    const d = distance(String(name).toLowerCase(), k.toLowerCase());
    if (d < least) { best = k; least = d; }
  }
  return best != null && least <= (Math.max(String(name).length, best.length) <= 3 ? 1 : 2) ? best : null;
}

/** The message for keys an object does not have: `unknown key "hight": did you mean "height"? (known: wall, along, …)`. */
export function unknownKeys(keys, known) {
  const meant = [...new Set(keys.map(k => closest(k, known)).filter(Boolean))];
  const hint = meant.length ? `: did you mean ${meant.map(k => `"${k}"`).join(', ')}?` : '';
  // a long list (the interface strings) would bury the hint
  const list = known.length && known.length <= 24 ? ` (known: ${known.join(', ')})` : '';
  return `unknown key${keys.length === 1 ? '' : 's'} ${keys.map(k => `"${k}"`).join(', ')}${hint}${list}`;
}
