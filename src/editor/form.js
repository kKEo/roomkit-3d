/**
 * Form fields generated from a prefab's zod schema, for the inspector. Each prop becomes
 * `{ key, kind, options?, int?, min?, nullable }`, where `kind` is `number`, `boolean`, `string`, `enum` or
 * `json` (lists, nested settings and choices between shapes, edited as JSON text). Defaults come from the
 * registry entry's `props`, which the schema already filled in.
 */

/** The value's own schema under `default`, `optional` and `nullable`, and whether null is allowed. */
function unwrap(schema) {
  let s = schema, nullable = false;
  for (;;) {
    const t = s?.def?.type;
    if (t === 'default' || t === 'prefault' || t === 'optional' || t === 'readonly') s = s.def.innerType;
    else if (t === 'nullable') { nullable = true; s = s.def.innerType; }
    else return { s, nullable };
  }
}

export function fieldOf(schema) {
  const { s, nullable } = unwrap(schema);
  const t = s?.def?.type;
  if (t === 'number') {
    const checks = (s.def.checks ?? []).map(c => c._zod?.def ?? {});
    const low = checks.find(c => c.check === 'greater_than');
    return {
      kind: 'number', nullable,
      int: checks.some(c => c.check === 'number_format' && /int/.test(c.format)),
      min: low && low.inclusive ? Number(low.value) : undefined,
    };
  }
  if (t === 'boolean' || t === 'string') return { kind: t, nullable };
  if (t === 'enum') return { kind: 'enum', options: Object.values(s.def.entries), nullable };
  return { kind: 'json', nullable };
}

/** The fields of a prefab's props, in the order its schema lists them; none for a schema that is not an object. */
export function propFields(schema) {
  const shape = unwrap(schema).s?.def?.shape;
  return shape ? Object.entries(shape).map(([key, s]) => ({ key, ...fieldOf(s) })) : [];
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Whether a written prop differs from the prefab's default (the inspector marks those). */
export const changed = (written, def) => written !== undefined && !same(written, def);
