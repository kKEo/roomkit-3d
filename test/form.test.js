import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { propFields, changed } from '../src/editor/form.js';
import { BUILTIN } from '../src/prefabs/registry.js';

describe('inspector form fields', () => {
  it('turns a prefab schema into fields', () => {
    const f = Object.fromEntries(propFields(BUILTIN.serverRack.schema).map(x => [x.key, x]));
    expect(f.count).toMatchObject({ kind: 'number', int: true });
    expect(f.cables).toMatchObject({ kind: 'boolean' });
    expect(f.ceiling).toMatchObject({ kind: 'number', nullable: true });
    const p = Object.fromEntries(propFields(BUILTIN.pictureFrame.schema).map(x => [x.key, x]));
    expect(p.image).toMatchObject({ kind: 'string', nullable: true });
    expect(p.exhibit).toMatchObject({ kind: 'enum', nullable: true });
    expect(p.exhibit.options).toContain('torus');
    expect(propFields(BUILTIN.desk.schema)[0]).toMatchObject({ key: 'screen', kind: 'json' });
  });

  it('gives every built-in prop a field, and inclusive minimums', () => {
    for (const m of Object.values(BUILTIN)) expect(propFields(m.schema).map(x => x.key)).toEqual(Object.keys(m.props));
    expect(propFields(z.strictObject({ n: z.number().min(0).default(1) }))[0].min).toBe(0);
    expect(propFields(z.string())).toEqual([]);
  });

  it('marks props that differ from the default', () => {
    expect(changed(undefined, 1)).toBe(false);
    expect(changed(1, 1)).toBe(false);
    expect(changed([1, 2], [1, 2])).toBe(false);
    expect(changed(2, 1)).toBe(true);
  });
});
