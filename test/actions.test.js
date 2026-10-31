import { describe, it, expect, vi } from 'vitest';
import { ACTIONS, ACTION_TYPES, actionSchema, runAction } from '../src/actions/registry.js';
import { registerScreen, sessionKey } from '../src/scene/screenState.js';
import { objectSchema } from '../src/config/schema.js';
import { PREFABS } from '../src/prefabs/registry.js';

const fakeStore = () => ({
  scene: { name: 's' }, current: 'a', pois: [{ id: 'a' }, { id: 'b' }],
  goTo: vi.fn(), zoomTo: vi.fn(), togglePanel: vi.fn(),
});

describe('actionSchema', () => {
  it('lists every action and validates each one', () => {
    expect(ACTION_TYPES).toEqual(['goTo', 'zoom', 'openUrl', 'togglePanel', 'emit']);
    expect(actionSchema.parse({ type: 'goTo', poi: 'b' })).toEqual({ type: 'goTo', poi: 'b' });
    expect(actionSchema.parse({ type: 'goTo', poi: null }).poi).toBe(null);
    expect(actionSchema.parse({ type: 'openUrl', url: '/x' })).toEqual({ type: 'openUrl', url: '/x', newTab: true });
    expect(actionSchema.safeParse({ type: 'goTo' }).success).toBe(false);
    expect(actionSchema.safeParse({ type: 'fly', poi: 'a' }).success).toBe(false);
    expect(actionSchema.safeParse({ type: 'openUrl', url: '/x', target: '_blank' }).success).toBe(false);
  });
});

describe('runAction', () => {
  it('goTo and togglePanel call the store', () => {
    const st = fakeStore();
    runAction({ type: 'goTo', poi: 'b' }, st);
    expect(st.goTo).toHaveBeenCalledWith('b');
    runAction({ type: 'togglePanel' }, st);
    expect(st.togglePanel).toHaveBeenCalled();
  });

  it('zoom finds a registered screen of the current POI by its id', () => {
    const st = fakeStore();
    const rec = { key: sessionKey('s', 'a', 'scr1', 0), poi: 'a', id: 'scr1', screen: {} };
    const off = registerScreen(rec.key, () => rec);
    runAction({ type: 'zoom', screen: 'scr1' }, st);
    expect(st.zoomTo).toHaveBeenCalledWith(rec);
    off();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    runAction({ type: 'zoom', screen: 'scr1' }, st);
    expect(st.zoomTo).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns on an unknown action instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => runAction({ type: 'nope' }, fakeStore())).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('every action has a schema with a literal type matching its key', () => {
    for (const [k, a] of Object.entries(ACTIONS)) expect(a.schema.parse({ ...minimal(k) }).type).toBe(k);
  });
});

const minimal = type => ({
  goTo: { type, poi: null }, zoom: { type }, openUrl: { type, url: 'x' }, togglePanel: { type }, emit: { type, name: 'n' },
}[type]);

describe('objects with actions', () => {
  it('accepts actions on the prefab\'s hotspots and rejects others', () => {
    const ok = objectSchema.parse({ type: 'door', actions: { door: { type: 'goTo', poi: null } } });
    expect(ok.actions.door).toEqual({ type: 'goTo', poi: null });
    const r = objectSchema.safeParse({ type: 'door', actions: { knob: { type: 'goTo', poi: null } } });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].path).toEqual(['actions', 'knob']);
    expect(r.error.issues[0].message).toMatch(/no hotspot "knob" \(it has: door\)/);
  });

  it('controlDesk hotspots follow its screens', () => {
    const props = PREFABS.controlDesk.schema.parse({ screens: [{}, { id: 'main' }] });
    expect(PREFABS.controlDesk.hotspots(props)).toEqual(['scr0', 'main']);
  });

  it('every prefab declares hotspots as strings', () => {
    for (const [type, m] of Object.entries(PREFABS)) {
      const hs = m.hotspots(m.props);
      expect(Array.isArray(hs), type).toBe(true);
      for (const h of hs) expect(typeof h).toBe('string');
    }
  });
});
