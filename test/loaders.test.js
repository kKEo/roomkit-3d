import { describe, it, expect } from 'vitest';
import { LOADERS, EXPORT_NAMES, loadComponent } from '../src/prefabs/loaders.js';
import { usedTypes } from '../src/prefabs/preload.js';
import { PREFAB_TYPES } from '../src/prefabs/registry.js';

describe('built-in prefab loaders', () => {
  it('cover exactly the registered types', () => {
    expect(Object.keys(LOADERS).sort()).toEqual([...PREFAB_TYPES].sort());
    expect(Object.keys(EXPORT_NAMES).sort()).toEqual([...PREFAB_TYPES].sort());
  });

  it.each(PREFAB_TYPES)('%s loads a component and memoises the request', async type => {
    expect(LOADERS[type]()).toBe(LOADERS[type]());
    expect(typeof await loadComponent(type)).toBe('function');
  });

  it('door, bench and primitive share one chunk', () => {
    expect(LOADERS.door).toBe(LOADERS.bench);
    expect(LOADERS.bench).toBe(LOADERS.primitive);
  });
});

describe('usedTypes', () => {
  it('collects the types of decor and POI objects', () => {
    const built = { scene: { decor: [{ type: 'door' }] }, pois: [{ objects: [{ type: 'pedestal' }] }, { objects: [{ type: 'desk' }, { type: 'door' }] }] };
    expect([...usedTypes(built)].sort()).toEqual(['desk', 'door', 'pedestal']);
  });
});
