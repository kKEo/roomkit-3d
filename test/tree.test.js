import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { inline, pretty, setAt, removeAt, insertAt, rawAt, replaceRaw, getAt } from '../src/editor/jsonEdit.js';
import {
  sceneTree, errorsByKey, parseKey, addToScenery, moveObject, makeStop, dissolveStop, deleteStop, deleteObject,
  duplicateObject, moveStop, renameObject, renameNewStop, setObjectField, setObjectRaw, setField, stopRefs, objectAt, objectRaw, viewSpot,
  prefabDecls, addPrefabDecls, removePrefabDecl, typeUses, typeNameProblem, typeNameFromUrl,
} from '../src/editor/tree.js';
import { newSceneFiles, objectTemplate } from '../src/editor/bundle.js';
import { buildScene, readerFromMap } from '../src/config/buildScene.js';
import { BUILTIN_REGISTRY } from '../src/prefabs/registry.js';

const build = files => buildScene({ name: 't', read: readerFromMap(files), resolveUrl: p => p, loadModule: async () => ({}) });

/** A published scene's text files, as the editor holds them. */
function sceneFiles(name) {
  const dir = join('public/scenes', name), files = new Map();
  for (const sub of ['', 'poi', 'content']) {
    for (const f of readdirSync(join(dir, sub))) if (/\.(json|md)$/.test(f)) files.set(sub ? `${sub}/${f}` : f, readFileSync(join(dir, sub, f), 'utf8'));
  }
  return files;
}

describe('jsonEdit', () => {
  const doc = '{\n  "a": 1,\n  "list": [\n    { "type": "x", "position": [0, 0, 0] },\n    { "type": "y",\n      "n": 2 }\n  ],\n  "c": { "d": 1 }\n}\n';

  it('formats like hand-written JSON', () => {
    expect(inline({ a: [1, 2], b: {} })).toBe('{ "a": [1, 2], "b": {} }');
    expect(pretty({ id: 'x', objects: [], content: { markdown: 'm.md' } })).toBe('{\n  "id": "x",\n  "objects": [],\n  "content": { "markdown": "m.md" }\n}');
    expect(pretty({ position: [1, 2, 3] })).toBe('{ "position": [1, 2, 3] }');
  });

  it('replaces a value in place, keeping everything around it', () => {
    const out = setAt(doc, ['list', 0, 'position'], [1, 2, 3]);
    expect(out).toBe(doc.replace('[0, 0, 0]', '[1, 2, 3]'));
    expect(setAt(doc, ['list', 1, 'n'], 5)).toBe(doc.replace('"n": 2', '"n": 5'));
  });

  it('adds a property after its neighbours, on one line or on its own line', () => {
    expect(setAt(doc, ['list', 0, 'name'], 'Lamp')).toContain('{ "type": "x", "position": [0, 0, 0], "name": "Lamp" }');
    expect(setAt(doc, ['list', 1, 'name'], 'Lamp')).toContain('"n": 2,\n      "name": "Lamp" }');
    expect(setAt(doc, ['camera', 'start'], 'a')).toContain('"c": { "d": 1 },\n  "camera": { "start": "a" }\n}');
    expect(setAt(doc, ['c', 'e'], true)).toContain('"c": { "d": 1, "e": true }');
  });

  it('removes a property or item with its comma', () => {
    expect(removeAt(doc, ['a'])).toBe(doc.replace('  "a": 1,\n', ''));
    expect(removeAt(doc, ['list', 1])).toBe(doc.replace(',\n    { "type": "y",\n      "n": 2 }', ''));
    expect(JSON.parse(removeAt(doc, ['list', 0])).list).toEqual([{ type: 'y', n: 2 }]);
    expect(removeAt(removeAt(doc, ['list', 0]), ['list', 0])).toContain('"list": []');
    expect(removeAt(doc, ['nothing'])).toBe(doc);
  });

  it('inserts items like their neighbours, and keeps a moved item\'s own layout', () => {
    const one = insertAt(doc, ['list'], 1, { value: { type: 'z' } });
    expect(one).toContain('[0, 0, 0] },\n    { "type": "z" },\n    { "type": "y",');
    const raw = rawAt(doc, ['list', 1]);
    expect(raw).toBe('{ "type": "y",\n  "n": 2 }');
    const moved = insertAt('{\n  "objects": []\n}\n', ['objects'], 0, { raw });
    expect(moved).toBe('{\n  "objects": [\n    { "type": "y",\n      "n": 2 }\n  ]\n}\n');
    expect(JSON.parse(insertAt(doc, ['new'], -1, { value: 1 })).new).toEqual([1]);
    expect(insertAt('{ "l": [1, 2] }', ['l'], -1, { value: 3 })).toBe('{ "l": [1, 2, 3] }');
  });

  it('replaces a node with JSON text, indented to fit', () => {
    const out = replaceRaw(doc, ['list', 1], '{\n  "type": "w"\n}');
    expect(out).toContain('  "list": [\n    { "type": "x", "position": [0, 0, 0] },\n    {\n      "type": "w"\n    }\n  ],');
    expect(() => replaceRaw(doc, ['list', 1], '{ nope')).toThrow();
  });

  it('refuses a file that is not JSON', () => {
    expect(() => setAt('{ "a": ', ['a'], 1)).toThrow(/not valid JSON/);
    expect(getAt(doc, ['list', 1, 'n'])).toBe(2);
  });
});

describe('scene tree', () => {
  it('reads the scenery and the stops of a shipped scene, with automatic labels', () => {
    const t = sceneTree(sceneFiles('cinema'));
    expect(t.ok).toBe(true);
    expect(t.decor.map(n => n.label)).toEqual(['projector', 'seats 1', 'seats 2', 'seats 3', 'seats 4', 'seats 5', 'seats 6', 'bench 1', 'bench 2']);
    expect(t.stops.map(s => s.id)).toEqual(['welcome', 'features', 'booth', 'machine', 'build', 'exits']);
    expect(t.stops[0]).toMatchObject({ key: 'stop:poi/01-welcome.json', label: 'Now showing', markdown: 'content/welcome.md', camera: true });
    expect(t.stops[0].objects[0]).toMatchObject({ key: 'poi/01-welcome.json:0', label: 'cinemaScreen · main' });
  });

  it('keeps a stop whose file is broken, and names objects by their name', () => {
    const files = newSceneFiles();
    files.set('poi/start.json', '{ nope');
    expect(sceneTree(files).stops[0]).toMatchObject({ bad: true, label: 'poi/start.json', objects: [] });
    const named = renameObject(newSceneFiles(), 'poi/start.json:0', 'Plinth');
    expect(sceneTree(named).stops[0].objects[0].label).toBe('Plinth');
    expect(sceneTree(renameObject(named, 'poi/start.json:0', ' ')).stops[0].objects[0].label).toBe('pedestal');
  });

  it('maps error lines to the node they are about', () => {
    const t = sceneTree(sceneFiles('cinema'));
    const m = errorsByKey([
      'c/scene.json › decor.2.props.count: Too small',
      'c/scene.json › camera.start: no POI has the id "x"',
      'c/poi/02-features.json › objects.0.props.x: Unrecognized key',
      'c/poi/03-booth.json › content.markdown: file not found',
      'c/poi/03-booth.json: invalid JSON — Unexpected token: x',
      'c/poi/zz.json: file not found',
    ], 'c', t);
    expect([...m.keys()]).toEqual(['decor:2', 'room', 'poi/02-features.json:0', 'stop:poi/03-booth.json']);
    expect(m.get('stop:poi/03-booth.json')).toEqual(['content.markdown: file not found', 'invalid JSON — Unexpected token: x']);
  });

  it('parses keys', () => {
    expect(parseKey('decor:3')).toEqual({ owner: 'decor', index: 3 });
    expect(parseKey('poi/a.json:0')).toEqual({ owner: 'poi/a.json', index: 0 });
    expect(parseKey('stop:poi/a.json')).toEqual({ stop: 'poi/a.json' });
    expect(parseKey('scenery')).toEqual({ group: 'scenery' });
  });
});

describe('tree operations', () => {
  const desk = { ...objectTemplate('desk', BUILTIN_REGISTRY), position: [2, 0, 1] };

  it('adds to the scenery, turns it into a stop, and back, and every step builds', async () => {
    let r = addToScenery(newSceneFiles(), desk);
    expect(r.key).toBe('decor:0');
    let { scene } = await build(r.files);
    expect(scene.decor.map(o => o.type)).toEqual(['desk']);

    r = makeStop(r.files, 'decor:0', 'Work desk');
    expect(r).toMatchObject({ key: 'stop:poi/work-desk.json', id: 'work-desk' });
    expect(r.files.get('content/work-desk.md')).toMatch(/^# Work desk/);
    const built = await build(r.files);
    expect(built.scene.decor).toEqual([]);
    expect(built.pois.map(p => p.id)).toEqual(['start', 'work-desk']);
    expect(built.pois[1].objects[0].position).toEqual([2, 0, 1]);
    expect(built.pois[1].camera).toBeDefined(); // placed from the object

    r = dissolveStop(r.files, 'poi/work-desk.json');
    expect(r.key).toBe('decor:0');
    expect(r.files.has('poi/work-desk.json')).toBe(false);
    expect(r.files.has('content/work-desk.md')).toBe(false);
    ({ scene } = await build(r.files));
    expect(scene.decor[0]).toMatchObject({ type: 'desk', position: [2, 0, 1] });
  });

  it('names a stop just made: its id, file and page follow the name', async () => {
    const made = makeStop(addToScenery(newSceneFiles(), desk).files, 'decor:0', 'Desk');
    const r = renameNewStop(made.files, made.file, 'Work corner');
    expect(r).toMatchObject({ key: 'stop:poi/work-corner.json', file: 'poi/work-corner.json' });
    expect(r.files.has('poi/desk.json') || r.files.has('content/desk.md')).toBe(false);
    expect(r.files.get('content/work-corner.md')).toMatch(/^# Work corner\n/);
    expect(JSON.parse(r.files.get('scene.json')).poi).toEqual(['poi/start.json', 'poi/work-corner.json']);
    expect((await build(r.files)).pois[1]).toMatchObject({ id: 'work-corner', label: 'Work corner' });
    expect(renameNewStop(made.files, made.file, 'desk').key).toBe('stop:poi/desk.json'); // same id: only the label
    expect(renameNewStop(made.files, made.file, 'Start').file).toBe('poi/start-2.json'); // taken: a free one
  });

  it('inserts a new stop after the selected one, with a free id', () => {
    let files = makeStop(addToScenery(newSceneFiles(), desk).files, 'decor:0', 'Start').files; // "start" is taken
    expect(JSON.parse(files.get('scene.json')).poi).toEqual(['poi/start.json', 'poi/start-2.json']);
    files = addToScenery(files, desk).files;
    files = makeStop(files, 'decor:0', 'Middle', 'poi/start.json').files;
    expect(JSON.parse(files.get('scene.json')).poi).toEqual(['poi/start.json', 'poi/middle.json', 'poi/start-2.json']);
  });

  it('moves objects between the scenery and stops, keeping their layout, and reorders within a list', async () => {
    const files = sceneFiles('cinema');
    const line = files.get('scene.json').split('\n').find(l => l.includes('"riser": 0.45') && l.includes('-4.2'));
    let r = moveObject(files, 'decor:3', 'poi/02-features.json');
    expect(r.key).toBe('poi/02-features.json:' + (JSON.parse(files.get('poi/02-features.json')).objects.length));
    expect(r.files.get('poi/02-features.json')).toContain(line.trim().replace(/,$/, ''));
    expect(JSON.parse(r.files.get('scene.json')).decor).toHaveLength(8);
    r = moveObject(r.files, r.key, 'decor', 3);
    expect(JSON.parse(r.files.get('scene.json'))).toEqual(JSON.parse(files.get('scene.json')));
    expect(r.files.get('scene.json')).toBe(files.get('scene.json'));

    const down = moveObject(files, 'decor:0', 'decor', 3);
    expect(down.key).toBe('decor:2');
    expect(JSON.parse(down.files.get('scene.json')).decor.map(o => o.type).slice(0, 4)).toEqual(['seats', 'seats', 'projector', 'seats']);
    expect(() => moveObject(files, 'poi/01-welcome.json:0', 'decor')).toThrow(/at least one object/);
  });

  it('dissolves into another stop, deletes, duplicates and reorders stops', () => {
    const files = sceneFiles('cinema');
    const into = dissolveStop(files, 'poi/01-welcome.json', 'poi/02-features.json');
    expect(into.key).toBe('stop:poi/02-features.json');
    expect(JSON.parse(into.files.get('poi/02-features.json')).objects.at(-1).type).toBe('cinemaScreen');
    expect(JSON.parse(into.files.get('scene.json')).camera.start).toBeUndefined(); // it was "welcome"

    const gone = deleteStop(files, 'poi/06-exits.json').files;
    expect(JSON.parse(gone.get('scene.json')).poi).toHaveLength(5);
    expect(gone.has('content/exits.md')).toBe(false);

    const dup = duplicateObject(renameObject(files, 'decor:7', 'West bench'), 'decor:7');
    expect(dup.key).toBe('decor:8');
    expect(objectAt(dup.files, 'decor:8')).toMatchObject({ type: 'bench', name: 'West bench copy', position: [-13.6, 0, 8] });

    expect(deleteObject(files, 'decor:8').key).toBe('decor:7');
    expect(() => deleteObject(files, 'poi/01-welcome.json:0')).toThrow();

    const order = moveStop(files, 'poi/06-exits.json', 0).files;
    expect(JSON.parse(order.get('scene.json')).poi[0]).toBe('poi/06-exits.json');
  });

  it('edits fields, prop by prop or as JSON, and lists what points at a stop', async () => {
    let files = setObjectField(newSceneFiles(), 'poi/start.json:0', ['props', 'height'], 2);
    expect(objectAt(files, 'poi/start.json:0').props.height).toBe(2);
    files = setObjectField(files, 'poi/start.json:0', ['props', 'height'], undefined);
    expect(objectAt(files, 'poi/start.json:0').props.height).toBeUndefined();
    files = setObjectRaw(files, 'poi/start.json:0', '{ "type": "bench" }');
    expect(objectRaw(files, 'poi/start.json:0')).toBe('{ "type": "bench" }');
    files = setField(files, 'poi/start.json', ['label'], 'Hall');
    expect((await build(files)).pois[0]).toMatchObject({ label: 'Hall', objects: [{ type: 'bench' }] });

    const refs = stopRefs(sceneFiles('cinema'), 'poi/01-welcome.json');
    expect(refs).toContain('scene.json › camera.start (where the room opens)');
    expect(refs).toContain('scene.json › decor.0 (projector) › actions.lens');
  });

  it('puts new objects where the camera looks, inside the room, facing the camera', () => {
    const room = { bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 } };
    expect(viewSpot({ position: [0, 5, 10], target: [0, 0, 0] }, room)).toEqual({ position: [0, 0, 0], rotation: [0, 0, 0] });
    expect(viewSpot({ position: [0, 2, 0], target: [0, 2, -30] }, room).position).toEqual([0, 0, -9]);
    expect(viewSpot({ position: [5, 3, 0], target: [0, 0, 0] }, room).rotation).toEqual([0, 90, 0]);
    expect(viewSpot({ position: [0, 5, 10], target: [0, 0, 0] }, room, [[0, 0, 0.5]]).position).toEqual([2, 0, 0]);
    expect(viewSpot({ position: [0, 5, 10], target: [9, 0, 0] }, room, [[9, 0, 0]]).position).toEqual([7, 0, 0]);
  });
});

describe("the scene's own types (scene.json › prefabs)", () => {
  const cinema = () => sceneFiles('cinema');
  const kiosk = 'https://cdn.example/kiosk.js';

  it('reads the declarations, {} when absent', () => {
    expect(prefabDecls(cinema())).toEqual({ seats: 'prefabs/seats.js', projector: 'prefabs/projector.js' });
    expect(prefabDecls(newSceneFiles())).toEqual({});
    expect(prefabDecls(new Map([['scene.json', '{ "prefabs": [1] }']]))).toEqual({});
  });

  it('adds declarations in one change, creating the map when missing and keeping the layout', () => {
    const { files, key } = addPrefabDecls(newSceneFiles(), { kiosk, plant: 'https://cdn.example/plant.js' });
    expect(key).toBe('room');
    expect(prefabDecls(files)).toEqual({ kiosk, plant: 'https://cdn.example/plant.js' });
    expect(files.get('scene.json')).toContain('"prefabs": { "kiosk": "https://cdn.example/kiosk.js", "plant": "https://cdn.example/plant.js" }');
    const before = cinema().get('scene.json');
    const after = addPrefabDecls(cinema(), { kiosk }).files.get('scene.json');
    // the cinema writes its map on one line, so the new entry joins that line
    expect(after.split('\n').length).toBe(before.split('\n').length);
    expect(after).toContain('"projector": "prefabs/projector.js", "kiosk": "https://cdn.example/kiosk.js" }');
    // the same module under the same name is not a change
    const same = cinema();
    expect(addPrefabDecls(same, { seats: 'prefabs/seats.js' }).files).toBe(same);
  });

  it('refuses a bad name, a built-in and a name declared with another module', () => {
    expect(() => addPrefabDecls(newSceneFiles(), { Kiosk: kiosk })).toThrow(/a type name is letters/);
    expect(() => addPrefabDecls(newSceneFiles(), { door: kiosk })).toThrow('"door" is a built-in type');
    expect(() => addPrefabDecls(cinema(), { seats: kiosk })).toThrow('"seats" is already declared (prefabs/seats.js)');
    expect(typeNameProblem('seats', cinema(), 'prefabs/seats.js')).toBeNull();
    expect(() => addPrefabDecls(new Map([['scene.json', '{']]), { kiosk })).toThrow(/not valid JSON/);
  });

  it('removes a declaration, and the map when it was the last; refuses while objects use the type', () => {
    expect(() => removePrefabDecl(cinema(), 'seats')).toThrow(/6 objects use "seats": seats 1, seats 2, seats 3, seats 4, seats 5, seats 6\. Delete them/);
    expect(() => removePrefabDecl(cinema(), 'projector')).toThrow(/an object uses "projector": projector\./);
    expect(typeUses(cinema(), 'projector').map(n => n.key)).toEqual(['decor:0']);
    const withKiosk = addPrefabDecls(cinema(), { kiosk }).files;
    const gone = removePrefabDecl(withKiosk, 'kiosk').files;
    expect(gone.get('scene.json')).toBe(cinema().get('scene.json'));
    const one = addPrefabDecls(newSceneFiles(), { kiosk }).files;
    const none = removePrefabDecl(one, 'kiosk').files;
    expect(none.get('scene.json')).toBe(newSceneFiles().get('scene.json'));
    const fresh = newSceneFiles();
    expect(removePrefabDecl(fresh, 'nope').files).toBe(fresh);
  });

  it('suggests a type name from a module URL', () => {
    expect(typeNameFromUrl('https://cdn.example/prefabs/kiosk.js')).toBe('kiosk');
    expect(typeNameFromUrl('https://cdn.example/desk-lamp@1.2.0.min.js?v=3')).toBe('deskLamp');
    expect(typeNameFromUrl('https://cdn.example/3d-plant.js')).toBe('type3dPlant');
    expect(typeNameFromUrl('https://cdn.example/Big%20Sign.JS')).toBe('bigSign');
    expect(typeNameFromUrl('https://cdn.example/door.js')).toBe('door2');
    expect(typeNameFromUrl('https://cdn.example/')).toBe('type');
    expect(typeNameFromUrl('https://cdn.example/seats.js', cinema())).toBe('seats2');
    expect(typeNameFromUrl('https://cdn.example/seats.js', cinema(), ['seats2'])).toBe('seats3');
    // the same module already declared keeps its name
    expect(typeNameFromUrl('prefabs/seats.js', cinema())).toBe('seats');
  });
});
