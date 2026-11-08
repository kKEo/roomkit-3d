/**
 * The little of semver a prefab's `requires` needs: `1.2.3` (that major, at least that version), `^1.2.3`
 * (the same), `>=1.2.3` (any later), `*` (anything). Versions are `major.minor.patch`; a shorter one is padded.
 */

const parse = v => {
  const m = /^\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?\s*$/.exec(v ?? '');
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
};

const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Whether `range` is something this understands. */
export const validRange = range => range === '*' || !!parse(String(range).replace(/^(\^|>=)/, ''));

/** Whether `version` satisfies `range`; false for a range it does not understand. */
export function satisfies(version, range) {
  if (range === '*') return true;
  const have = parse(version);
  const m = /^\s*(\^|>=)?(.*)$/.exec(String(range));
  const want = m && parse(m[2]);
  if (!have || !want) return false;
  if (cmp(have, want) < 0) return false;
  return m[1] === '>=' || have[0] === want[0];
}
