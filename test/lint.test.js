import { describe, it, expect } from 'vitest';
import { inspectScene, readerFromMap } from '../src/config/buildScene.js';
import { lintScene, formatFinding, yawFor } from '../src/lint/rules.js';
import { penetration, objectBox, segmentHitsBox } from '../src/lint/geometry.js';
import { walls } from '../src/lib/footprint.js';
import { BUILTIN_REGISTRY } from '../src/prefabs/registry.js';
import { objectSchema } from '../src/config/schema.js';

/** A 20 × 20 × 8 room with one stop; `scene` and `poi` are merged over it. */
function folder({ scene = {}, poi = {}, extra = {} } = {}) {
  return new Map(Object.entries({
    'scene.json': JSON.stringify({ room: { width: 20, height: 8, depth: 20, lights: [[0, 7.6, 0]] }, poi: ['poi/a.json'], ...scene }),
    'poi/a.json': JSON.stringify({
      id: 'a', label: 'A', objects: [{ type: 'bench', position: [0, 0, 0] }],
      camera: { position: [0, 2, 6], target: [0, 0.5, 0] }, content: { blocks: [{ type: 'heading', text: 'A' }] }, ...poi,
    }),
    ...extra,
  }));
}

async function lint(files, ctx = {}) {
  const built = await inspectScene({ name: 's', read: readerFromMap(files), resolveUrl: p => `/s/${p}` });
  return lintScene(built, { files, exists: async p => files.has(p), ...ctx });
}
const codes = fs => fs.map(f => f.code).sort();

describe('lintScene', () => {
  it('finds nothing in a tidy scene', async () => {
    expect(await lint(folder())).toEqual([]);
  });

  it('reports scene.json and POI mistakes in one run', async () => {
    const files = folder({ scene: { room: { width: -1, height: 8, depth: 20 } }, poi: { objects: [{ type: 'sofa' }] } });
    const fs = await lint(files);
    expect(fs.filter(f => f.code === 'CONFIG').map(f => `${f.file} › ${f.path}`)).toEqual(['s/scene.json › room.width', 's/poi/a.json › objects.0.type']);
    expect(fs.at(-1).code).toBe('GEO_SKIPPED');
  });

  it('objects: outside the room, overlapping, off the floor, through the ceiling', async () => {
    const fs = await lint(folder({ scene: { decor: [
      { type: 'bench', position: [9.5, 0, 0] },                                  // 5.6 m wide: pokes through the east wall
      { type: 'bench', position: [2.5, 0, 0], rotation: [0, 90, 0] },            // across the end of the stop's bench
      { type: 'wardrobe', position: [-6, 1, -6] },                               // a floor object in mid-air
      { type: 'wardrobe', position: [6, 0, -6], props: { height: 9 } },          // taller than the room
    ] } }));
    expect(codes(fs)).toEqual(['OBJ_ABOVE_CEILING', 'OBJ_FLOATING', 'OBJ_OUTSIDE', 'OBJ_OVERLAP']);
    const outside = fs.find(f => f.code === 'OBJ_OUTSIDE');
    expect(outside).toMatchObject({ level: 'error', file: 's/scene.json', path: 'decor.0.position' });
    expect(outside.message).toMatch(/reaches 2\.3 m outside/);
  });

  it('wall objects: on the wall line and facing in', async () => {
    const frame = (position, rotation = [0, 0, 0]) => ({ type: 'pictureFrame', position, rotation });
    const fs = await lint(folder({ scene: { decor: [
      frame([0, 3, -10]),              // north wall, facing +Z: fine
      frame([-10, 3, 4], [0, 90, 0]),  // west wall, facing +X: fine
      frame([5, 3, -8]),               // two metres off the wall
      frame([10, 3, 4], [0, 90, 0]),   // on the east wall, facing out of the room
    ] } }));
    expect(fs.map(f => [f.code, f.path])).toEqual([['WALL_GAP', 'decor.2.position'], ['WALL_FACING', 'decor.3.rotation'], ['OBJ_OUTSIDE', 'decor.3.position']]);
    expect(fs[1].hint).toMatch(/yaw -90/);
  });

  it('cameras: outside the room, inside an object, sight line blocked by another stop\'s object', async () => {
    const at = async camera => codes(await lint(folder({ poi: { camera }, scene: { decor: [{ type: 'wardrobe', position: [0, 0, 4] }] } })));
    expect(await at({ position: [0, 2, 14], target: [0, 0.5, 0] })).toEqual(['CAM_OUTSIDE_ROOM']);
    expect(await at({ position: [0, 2, 4], target: [0, 0.5, 0] })).toEqual(['CAM_IN_OBJECT']);
    expect(await at({ position: [0, 2, 8], target: [0, 0.5, 0] })).toEqual(['CAM_BLOCKED']);
    expect(await at({ position: [5, 2, 6], target: [0, 0.5, 0] })).toEqual([]);
  });

  it('references: POI ids, screens, links, fenced blocks, media, the index', async () => {
    const files = folder({
      poi: {
        objects: [{ type: 'desk', position: [0, 0, 0], props: { src: 'media/gone.png' }, actions: {
          screen: { type: 'zoom', screen: 'tv' },
          chair: { type: 'goTo', poi: 'nowhere' },
        } }],
        content: { markdown: 'content/a.md' },
      },
      extra: { 'content/a.md': 'See [the lab](#lab).\n\n```stats\n[{ "value": 1 }]\n```\n\n```js\nnot a block\n```\n' },
    });
    const fs = await lint(files, { listed: false });
    expect(fs.map(f => [f.level, f.code, f.file, f.path])).toEqual([
      ['warn', 'INDEX_MISSING', 'scenes/index.json', 'scenes'],
      ['warn', 'REF_SCREEN', 's/poi/a.json', 'objects.0.actions.screen.screen'],
      ['error', 'REF_POI', 's/poi/a.json', 'objects.0.actions.chair.poi'],
      ['warn', 'REF_LINK', 's/content/a.md', ''],
      ['error', 'MD_BLOCK', 's/content/a.md', ''],
      ['error', 'REF_MEDIA', 's/scene.json', ''],
    ]);
    expect(fs[1].hint).toBe('its clickable parts are: screen, chair');
  });

  it('room: width and depth beside a footprint, lights and pillars outside', async () => {
    const fs = await lint(folder({ scene: { room: {
      width: 30, height: 8, footprint: [[-10, -10], [10, -10], [10, 10], [-10, 10]], lights: [[0, 7.6, 30]], pillars: [[14, 0]],
    } } }));
    expect(codes(fs)).toEqual(['LIGHT_OUTSIDE', 'PILLAR_OUTSIDE', 'ROOM_SIZE_IGNORED']);
  });

  it('formats a finding as one line', () => {
    expect(formatFinding({ level: 'warn', code: 'X', file: 's/scene.json', path: 'decor.0', message: 'm', hint: 'h' })).toBe('warn  X  s/scene.json › decor.0: m (h)');
  });
});

describe('lint geometry', () => {
  const box = o => objectBox(objectSchema.parse(o), BUILTIN_REGISTRY);

  it('an object\'s outline follows its rotation, scale and front', () => {
    const b = box({ type: 'bench', position: [1, 0, 2], rotation: [0, 90, 0], scale: 2 });
    const xs = b.poly.map(p => p[0]), zs = b.poly.map(p => p[1]);
    expect([Math.min(...xs), Math.max(...xs)].map(v => +v.toFixed(2))).toEqual([0.1, 1.9]);
    expect([Math.min(...zs), Math.max(...zs)].map(v => +v.toFixed(2))).toEqual([-3.6, 7.6]);
    expect(b.front.map(v => +v.toFixed(2))).toEqual([1, 0]);
    expect(b.y1).toBeCloseTo(1.4);
    expect(box({ type: 'bench', rotation: [10, 0, 0] }).tilted).toBe(true);
    expect(box({ type: 'pedestal' }).poly).toHaveLength(16);
  });

  it('penetration is how far two outlines reach into each other', () => {
    const sq = (x, z, h = 1) => [[x - h, z - h], [x + h, z - h], [x + h, z + h], [x - h, z + h]];
    expect(penetration(sq(0, 0), sq(1.5, 0))).toBeCloseTo(0.5);
    expect(penetration(sq(0, 0), sq(3, 0))).toBe(0);
  });

  it('a line of sight either crosses a box or not', () => {
    const b = box({ type: 'wardrobe', position: [0, 0, 0] });
    expect(segmentHitsBox(b, [0, 2, 5], [0, 2, -5])).toBe(true);
    expect(segmentHitsBox(b, [0, 6, 5], [0, 6, -5])).toBe(false);
    expect(segmentHitsBox(b, [0, 2, 5], [0, 2, 3])).toBe(false);
  });

  it('walls are named by compass, north being −Z, and by edge when a side has two', () => {
    expect(walls([[-5, -5], [5, -5], [5, 5], [-5, 5]]).map(w => w.name)).toEqual(['north wall', 'east wall', 'south wall', 'west wall']);
    const L = walls([[-12, -12], [12, -12], [12, 0], [0, 0], [0, 12], [-12, 12]]);
    expect(L.map(w => w.name)).toEqual(['north wall', 'east wall (edge 1)', 'south wall (edge 2)', 'east wall (edge 3)', 'south wall (edge 4)', 'west wall']);
    expect(L.map(w => yawFor(w))).toEqual([0, -90, 180, -90, 180, 90]);
  });
});
