import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

/** Where prefab and transform code may come from: the build-time list and the operator's runtime list. */
describe('guardOrigin and the runtime prefab origins', () => {
  let origins;
  beforeEach(async () => {
    vi.stubGlobal('location', { href: 'https://site.test/app/', origin: 'https://site.test' });
    origins = await import('../src/config/origins.js');
    origins.setRuntimeOrigins([]);
  });
  afterEach(() => { origins.setRuntimeOrigins([]); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('allows the page and the scenes origin, and blocks others by default', () => {
    expect(origins.guardOrigin('https://site.test/scenes/x/p.js')).toBe('https://site.test/scenes/x/p.js');
    expect(origins.guardOrigin('blob:https://site.test/abc')).toBe('blob:https://site.test/abc');
    expect(() => origins.guardOrigin('https://cdn.example/p.js')).toThrow('blocked: https://cdn.example is not an allowed prefab origin (see prefabOrigins in scenes/index.json, or VITE_PREFAB_ORIGINS)');
  });

  it('a runtime list from scenes/index.json allows an origin without a rebuild', () => {
    origins.setRuntimeOrigins(origins.prefabOriginsOf({ prefabOrigins: ['https://cdn.example', 'https://other.example/with/path', 'not a url', 7] }));
    expect(origins.prefabOrigins()).toEqual(['https://cdn.example', 'https://other.example']);
    expect(origins.guardOrigin('https://cdn.example/p.js')).toBe('https://cdn.example/p.js');
    expect(origins.guardOrigin('https://other.example/p.js')).toBe('https://other.example/p.js');
    expect(() => origins.guardOrigin('https://third.example/p.js')).toThrow(/blocked/);
  });

  it('"*" in either list allows any origin, and the two lists merge', () => {
    expect(origins.prefabOriginsOf({ prefabOrigins: '*' })).toEqual(['*']);
    expect(origins.prefabOriginsOf({ prefabOrigins: ['*', 'https://a.example'] })).toEqual(['*', 'https://a.example']);
    expect(origins.prefabOriginsOf({})).toEqual([]);
    expect(origins.prefabOriginsOf({ prefabOrigins: 'https://a.example' })).toEqual([]);
    vi.stubEnv('VITE_PREFAB_ORIGINS', 'https://built.example');
    origins.setRuntimeOrigins(['https://cdn.example']);
    expect(origins.prefabOrigins()).toEqual(['https://built.example', 'https://cdn.example']);
    expect(origins.guardOrigin('https://built.example/p.js')).toBe('https://built.example/p.js');
    origins.setRuntimeOrigins(['*']);
    expect(origins.guardOrigin('https://anything.example/p.js')).toBe('https://anything.example/p.js');
  });

  it('setRuntimeOrigins keeps only origins (no paths, no junk)', () => {
    origins.setRuntimeOrigins(['https://cdn.example/path', 'https://ok.example', 'junk', null]);
    expect(origins.prefabOrigins()).toEqual(['https://ok.example']);
    origins.setRuntimeOrigins('nope');
    expect(origins.prefabOrigins()).toEqual([]);
  });
});
