import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  SOURCES, screenKind, screenSlots, slotHotspot, fullProps, screenIssues, droppedBy, setScreenKey, setSource, setClick,
  setScreenId, setAction, addScreen, removeScreen, moveScreen, startScreen, transformNames,
} from '../src/editor/screenForm.js';
import { propFields } from '../src/editor/form.js';
import { objectAt, addToScenery } from '../src/editor/tree.js';
import { newSceneFiles } from '../src/editor/bundle.js';
import { buildScene, readerFromMap } from '../src/config/buildScene.js';
import { BUILTIN_REGISTRY } from '../src/prefabs/registry.js';
import { SCREEN_SOURCES, screenSchema } from '../src/prefabs/screenSchema.js';

const build = files => buildScene({ name: 't', read: readerFromMap(files), resolveUrl: p => p, loadModule: async () => ({}) });
const entryOf = type => BUILTIN_REGISTRY.get(type);
const slotsOf = (files, key) => {
  const obj = objectAt(files, key), entry = entryOf(obj.type);
  return screenSlots(entry, obj, propFields(entry.schema));
};

function sceneFiles(name) {
  const dir = join('public/scenes', name), files = new Map();
  for (const sub of ['', 'poi', 'content']) {
    for (const f of readdirSync(join(dir, sub))) if (/\.(json|md)$/.test(f)) files.set(sub ? `${sub}/${f}` : f, readFileSync(join(dir, sub, f), 'utf8'));
  }
  return files;
}

/** A new scene with one object of `type` in the scenery. */
function withObject(type, props) {
  const { files, key } = addToScenery(newSceneFiles('t'), { type, position: [0, 0, 0], ...(props ? { props } : {}) });
  return { files, key, entry: entryOf(type) };
}

describe('screen editor model', () => {
  it('knows every source and the keys it reads', () => {
    expect(Object.keys(SOURCES)).toEqual(SCREEN_SOURCES);
    const known = new Set(Object.keys(screenSchema.shape));
    for (const s of Object.values(SOURCES)) for (const k of s.keys) expect(known.has(k), k).toBe(true);
  });

  it('finds the props that hold screens, by schema', () => {
    const kinds = type => Object.fromEntries(Object.entries(entryOf(type).schema.shape).map(([k, s]) => [k, screenKind(s)]).filter(([, v]) => v));
    expect(kinds('controlDesk')).toEqual({ screens: { kind: 'screens' } });
    expect(kinds('desk')).toEqual({ screen: { kind: 'screen', names: true } });
    expect(kinds('cinemaScreen')).toEqual({ screen: { kind: 'screen', names: true } });
    expect(kinds('pictureFrame')).toEqual({});
  });

  it('names each screen by the hotspot the prefab gives it', () => {
    const files = sceneFiles('cinema');
    const booth = slotsOf(files, 'poi/03-booth.json:0');
    expect(booth.map(s => s.hotspot)).toEqual(['house', 'now', 'occupancy', 'programme', 'console', 'uplink']);
    expect(booth[0]).toMatchObject({ byId: true, fallback: 'scr0', written: true });
    const { files: f2, key, entry } = withObject('controlDesk');
    const wall = slotsOf(f2, key);
    expect(wall.map(s => s.hotspot)).toEqual(['scr0', 'scr1', 'scr2', 'scr3', 'scr4', 'scr5']);
    expect(wall[0]).toMatchObject({ screen: {}, written: false });
    expect(slotHotspot(entry, fullProps(entry, {}), 'screens', 2).hotspot).toBe('scr2');
  });

  it('names a desk screen by its id and a cinema screen always "screen"', () => {
    const d = withObject('desk', { screen: { source: 'text', id: 'mon' } });
    expect(slotsOf(d.files, d.key)[0]).toMatchObject({ hotspot: 'mon', byId: true, fallback: 'screen' });
    const c = withObject('cinemaScreen', { screen: { source: 'text', id: 'x' } });
    expect(slotsOf(c.files, c.key)[0]).toMatchObject({ hotspot: 'screen', byId: false });
  });

  it('reports a screen problem under its key', () => {
    expect(screenIssues({ source: 'graph', color: 'url(x)' })).toHaveProperty('color');
    expect(screenIssues({ source: 'text', feed: { refresh: 5 } })).toHaveProperty('feed');
    expect(screenIssues({ source: 'text', lines: ['a'] })).toEqual({});
  });

  it('writes out a default list before changing one screen of it', async () => {
    const { files, key, entry } = withObject('controlDesk');
    const slot = slotsOf(files, key)[1];
    const out = setSource(files, key, entry, slot, 'text');
    const out2 = setScreenKey(out, key, entry, slotsOf(out, key)[1], 'lines', ['hello']);
    expect(objectAt(out2, key).props.screens).toEqual([{}, { source: 'text', lines: ['hello'] }, {}, {}, {}, {}]);
    await expect(build(out2)).resolves.toBeTruthy();
  });

  it('drops the keys the new source does not read', () => {
    expect(droppedBy({ source: 'graph', graph: 'bars', values: [1], title: 'T', id: 'g', feed: 'x' }, 'stats').sort()).toEqual(['graph', 'values']);
    const { files, key, entry } = withObject('controlDesk', { screens: [{ source: 'graph', graph: 'bars', title: 'LOAD', id: 'g' }] });
    const out = setSource(files, key, entry, slotsOf(files, key)[0], 'stats');
    expect(objectAt(out, key).props.screens[0]).toEqual({ source: 'stats', title: 'LOAD', id: 'g' });
  });

  it('turns a bare source name into a config, and leaves it alone for nothing to remove', () => {
    const { files, key, entry } = withObject('desk', { screen: 'video', src: 'a.mp4' });
    const slot = slotsOf(files, key)[0];
    expect(setScreenKey(files, key, entry, slot, 'title', undefined)).toBe(files);
    const out = setScreenKey(files, key, entry, slot, 'src', 'b.mp4');
    expect(objectAt(out, key).props.screen).toEqual({ source: 'video', src: 'b.mp4' });
  });

  it('sets what a click does: zoom, nothing or an action', () => {
    const files0 = sceneFiles('cinema');
    const key = 'poi/03-booth.json:0', entry = entryOf('controlDesk');
    const slot = () => slotsOf(files, key)[4];
    let files = setClick(files0, key, entry, slotsOf(files0, key)[4], 'none');
    expect(objectAt(files, key).props.screens[4].zoom).toBe(false);
    files = setClick(files, key, entry, slot(), { type: 'goTo', poi: 'welcome' });
    expect(objectAt(files, key).actions).toEqual({ console: { type: 'goTo', poi: 'welcome' } });
    expect('zoom' in objectAt(files, key).props.screens[4]).toBe(false);
    expect(entry.schema.safeParse(objectAt(files, key).props).success).toBe(true);
    files = setClick(files, key, entry, slot(), 'zoom');
    expect(objectAt(files, key).actions).toBeUndefined();
    expect(files.get('poi/03-booth.json')).toBe(files0.get('poi/03-booth.json'));
  });

  it('moves the bound action along when a screen is renamed', async () => {
    const { files, key, entry } = withObject('controlDesk', { screens: [{ source: 'text' }, {}] });
    let out = setAction(files, key, 'scr0', { type: 'togglePanel' });
    out = setScreenId(out, key, entry, slotsOf(out, key)[0], 'status');
    expect(objectAt(out, key)).toMatchObject({ actions: { status: { type: 'togglePanel' } }, props: { screens: [{ source: 'text', id: 'status' }, {}] } });
    out = setScreenId(out, key, entry, slotsOf(out, key)[0], '');
    expect(objectAt(out, key).actions).toEqual({ scr0: { type: 'togglePanel' } });
    await expect(build(out)).resolves.toBeTruthy();
  });

  it('carries actions bound by place when screens are added, moved or removed', () => {
    const { files, key, entry } = withObject('controlDesk', { screens: [{ source: 'text' }, { source: 'graph', id: 'g' }, { source: 'stats' }] });
    let out = setAction(setAction(files, key, 'scr2', { type: 'togglePanel' }), key, 'g', { type: 'goTo', poi: null });
    out = addScreen(out, key, entry, 'screens', 0);
    expect(objectAt(out, key).props.screens.map(s => s.source)).toEqual([undefined, 'text', 'graph', 'stats']);
    expect(objectAt(out, key).actions).toEqual({ g: { type: 'goTo', poi: null }, scr3: { type: 'togglePanel' } });
    out = moveScreen(out, key, entry, 'screens', 3, 0);
    expect(objectAt(out, key).props.screens.map(s => s.source)).toEqual(['stats', undefined, 'text', 'graph']);
    expect(objectAt(out, key).actions).toEqual({ g: { type: 'goTo', poi: null }, scr0: { type: 'togglePanel' } });
    out = removeScreen(out, key, entry, 'screens', 0);
    expect(objectAt(out, key).actions).toEqual({ g: { type: 'goTo', poi: null } });
    expect(objectAt(out, key).props.screens).toHaveLength(3);
  });

  it('keeps a moved screen as it was written', () => {
    const files = sceneFiles('cinema'), key = 'poi/03-booth.json:0', entry = entryOf('controlDesk');
    const out = moveScreen(files, key, entry, 'screens', 4, 5);
    const text = out.get('poi/03-booth.json');
    expect(text).toContain('"reel": "RoomKit 3D intro, 36 s, looping on the main screen",');
    expect(objectAt(out, key).props.screens.map(s => s.id)).toEqual(['house', 'now', 'occupancy', 'programme', 'uplink', 'console']);
  });

  it('turns a cinema screen\'s source and src into a full screen config', async () => {
    const { files, key, entry } = withObject('cinemaScreen', { source: 'video', src: 'media/a.mp4' });
    const out = startScreen(files, key, entry, 'screen');
    expect(objectAt(out, key).props).toEqual({ screen: { source: 'video', src: 'media/a.mp4' } });
    await expect(build(out)).resolves.toBeTruthy();
  });

  it('lists the transforms scene.json declares', () => {
    expect(transformNames(sceneFiles('cinema'))).toContain('houseStats');
    expect(transformNames(newSceneFiles('t'))).toEqual([]);
  });
});
