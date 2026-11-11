import { describe, it, expect } from 'vitest';
import { buildScene, readerFromMap } from '../src/config/buildScene.js';
import { objectSchema } from '../src/config/schema.js';
import { resolvePlacement, placementText, findWall } from '../src/config/placement.js';
import { BUILTIN_REGISTRY } from '../src/prefabs/registry.js';
import { walls, withFootprint } from '../src/lib/footprint.js';
import { lintScene } from '../src/lint/rules.js';
import { inspectScene } from '../src/config/buildScene.js';
import { detachPlacement, duplicateObject, objectAt } from '../src/editor/tree.js';

const rect = withFootprint({ width: 20, depth: 30, height: 8 });   // walls at x ±10, z ±15
const loft = withFootprint({ width: 1, depth: 1, height: 7, footprint: [[-12, -12], [12, -12], [12, 0], [0, 0], [0, 12], [-12, 12]] });

function place(o, room = rect) {
  const errors = [];
  const r = resolvePlacement(objectSchema.parse(o), room, BUILTIN_REGISTRY, (path, msg) => errors.push(`${path}: ${msg}`));
  return errors.length ? errors : { position: r.position, rotation: r.rotation };
}

describe('objectSchema › at', () => {
  it('takes a wall with defaults, and refuses it beside position or rotation', () => {
    expect(objectSchema.parse({ type: 'door', at: { wall: 'north' } }).at).toEqual({ wall: 'north', height: 0, offset: 0, turn: 0 });
    const both = objectSchema.safeParse({ type: 'door', position: [0, 0, 0], at: { wall: 'north' } });
    expect(both.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)).toEqual(['at: give "at" or "position"/"rotation", not both']);
    expect(objectSchema.safeParse({ type: 'door', rotation: [0, 90, 0], at: { wall: 2 } }).success).toBe(false);
  });

  it('refuses an unknown wall, a fraction past 1, along with distance, and unknown keys', () => {
    const msg = at => objectSchema.safeParse({ type: 'door', at }).error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    expect(msg({ wall: 'up' })).toEqual(['at.wall: a wall is "north", "south", "east", "west" or its number in room.footprint']);
    expect(msg({ wall: 'north', along: 1.4 })).toEqual(['at.along: a fraction 0–1; use "distance" for metres']);
    expect(msg({ wall: 'north', along: 0.2, distance: 3 })).toEqual(['at: give "along" (a fraction) or "distance" (metres), not both']);
    expect(msg({ wall: 'north', hight: 2 })[0]).toMatch(/^at: Unrecognized key/);
  });
});

describe('resolvePlacement', () => {
  it('leaves an object without `at` alone', () => {
    const o = objectSchema.parse({ type: 'bench', position: [1, 0, 2] });
    expect(resolvePlacement(o, rect, BUILTIN_REGISTRY, () => {})).toBe(o);
  });

  it('hangs a wall object on each wall, facing into the room; left is as seen from inside', () => {
    const frame = at => place({ type: 'pictureFrame', at: { height: 3, ...at } });
    expect(frame({ wall: 'north' })).toEqual({ position: [0, 3, -15], rotation: [0, 0, 0] });
    expect(frame({ wall: 'south' })).toEqual({ position: [0, 3, 15], rotation: [0, 180, 0] });
    expect(frame({ wall: 'west' })).toEqual({ position: [-10, 3, 0], rotation: [0, 90, 0] });
    expect(frame({ wall: 'east' })).toEqual({ position: [10, 3, 0], rotation: [0, -90, 0] });
    // facing the north wall, left is west; facing the east wall, left is north
    expect(frame({ wall: 'north', along: 0.25 }).position).toEqual([-5, 3, -15]);
    expect(frame({ wall: 'north', distance: 4 }).position).toEqual([-6, 3, -15]);
    expect(frame({ wall: 'east', distance: 4 }).position).toEqual([10, 3, -11]);
    expect(frame({ wall: 'south', distance: 4 }).position).toEqual([6, 3, 15]);
  });

  it('sets a floor object with its back against the wall, using its size, scale and front', () => {
    expect(place({ type: 'wardrobe', at: { wall: 'north' } })).toEqual({ position: [0, 0, -14.4], rotation: [0, 0, 0] });
    expect(place({ type: 'wardrobe', scale: 2, at: { wall: 'west' } }).position).toEqual([-8.8, 0, 0]);
    expect(place({ type: 'wardrobe', at: { wall: 'north', offset: 1, turn: 180 } })).toEqual({ position: [0, 0, -13.4], rotation: [0, 180, 0] });
    const seats = { ...BUILTIN_REGISTRY, get: () => ({ geometry: () => ({ min: [-2, 0, -1.4], max: [2, 1.7, 1.2], mount: 'floor', front: '-z' }) }) };
    const r = resolvePlacement({ ...objectSchema.parse({ type: 'bench', at: { wall: 'north' } }) }, rect, seats, () => {});
    expect(r).toMatchObject({ position: [0, 0, -13.8], rotation: [0, 180, 0] }); // faces −Z locally: turned round, its back (+Z side, 1.2 m) on the wall
  });

  it('names walls by number in a room where two face the same way', () => {
    expect(place({ type: 'door', at: { wall: 2 } }, loft)).toEqual({ position: [6, 0, 0], rotation: [0, 180, 0] });
    expect(place({ type: 'door', at: { wall: 'north' } }, loft).position).toEqual([0, 0, -12]);
    expect(place({ type: 'door', at: { wall: 'south' } }, loft)).toEqual(['at.wall: "south" names 2 walls of this room (edges 2 and 4); give the edge index']);
    expect(place({ type: 'door', at: { wall: 7 } }, loft)).toEqual(['at.wall: no wall 7 (this room has edges 0–5)']);
    expect(place({ type: 'door', at: { wall: 2, distance: 14 } }, loft)).toEqual(['at.distance: 14 is past the end of the wall (12 m long)']);
    const tri = withFootprint({ height: 5, footprint: [[0, 0], [10, 0], [0, 10]] });
    expect(findWall(walls(tri.footprint), 'south').error).toMatch(/^this room has no south wall \(it has: north wall, wall \(edge 1\), west wall\)/);
    expect(place({ type: 'door', at: { wall: 1 } }, tri)).toEqual({ position: [5, 0, 5], rotation: [0, -135, 0] });
  });

  it('reads back in words', () => {
    expect(placementText({ wall: 'north', along: 0.4, height: 1.5, offset: 0, turn: 0 })).toBe('north wall, 40% along, 1.5 m up');
    expect(placementText({ wall: 3, distance: 2, height: 0, offset: 0.5, turn: 90 })).toBe('wall 3, 2 m from its left end, 0.5 m out, turned 90°');
  });
});

describe('`at` in a scene', () => {
  const files = (decor, objects) => new Map(Object.entries({
    'scene.json': JSON.stringify({ room: { width: 20, height: 8, depth: 30, lights: [[0, 7.6, 0]] }, decor, poi: ['poi/a.json'] }),
    'poi/a.json': JSON.stringify({ id: 'a', label: 'A', objects, content: { blocks: [{ type: 'heading', text: 'A' }] } }),
  }));
  const opts = m => ({ name: 's', read: readerFromMap(m), resolveUrl: p => p });

  it('resolves in decor and in stops before the camera is placed, and passes the scene checks', async () => {
    const m = files([{ type: 'door', at: { wall: 'south', along: 0.2 } }, { type: 'wardrobe', at: { wall: 'east' } }], [{ type: 'pictureFrame', at: { wall: 'west', height: 3 } }]);
    const { scene, pois } = await buildScene(opts(m));
    expect(scene.decor.map(o => [o.position, o.rotation])).toEqual([[[6, 0, 15], [0, 180, 0]], [[9.4, 0, 0], [0, -90, 0]]]);
    expect(pois[0].objects[0].position).toEqual([-10, 3, 0]);
    expect(pois[0].camera.target.map(v => +v.toFixed(3))).toEqual([-8.7, 3, 0]); // the frame's focus, 1.3 m in front of the wall
    expect(await lintScene(await inspectScene(opts(m)), { files: m })).toEqual([]);
  });

  it('reports a wall the room does not have as a config error line', async () => {
    const m = files([{ type: 'door', at: { wall: 9 } }], [{ type: 'pictureFrame', at: { wall: 'north', distance: 40 } }]);
    const e = await buildScene(opts(m)).catch(err => err);
    expect(e.lines).toEqual([
      's/scene.json › decor.0.at.wall: no wall 9 (this room has edges 0–3)',
      's/poi/a.json › objects.0.at.distance: 40 is past the end of the wall (20 m long)',
    ]);
  });

  it('editor: moving a wall-placed object writes coordinates in place of `at`; a copy goes further along the wall', () => {
    const m = files([{ type: 'door', at: { wall: 'south', along: 0.2 } }, { type: 'door', at: { wall: 'east', distance: 3 } }], [{ type: 'bench' }]);
    const moved = detachPlacement(m, 'decor:0', { position: [1, 0, 15], rotation: [0, 180, 0] });
    expect(objectAt(moved, 'decor:0')).toEqual({ type: 'door', position: [1, 0, 15], rotation: [0, 180, 0] });
    expect(objectAt(duplicateObject(m, 'decor:0').files, 'decor:1').at).toEqual({ wall: 'south', along: 0.3 });
    expect(objectAt(duplicateObject(m, 'decor:1').files, 'decor:2').at).toEqual({ wall: 'east', distance: 4 });
  });
});
