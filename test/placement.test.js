import { describe, it, expect } from 'vitest';
import { buildScene, readerFromMap } from '../src/config/buildScene.js';
import { objectSchema } from '../src/config/schema.js';
import { resolvePlacement, placeAll, placementText, facingText, findWall, findCorner, yawTowards } from '../src/config/placement.js';
import { BUILTIN_REGISTRY } from '../src/prefabs/registry.js';
import { walls, corners, withFootprint } from '../src/lib/footprint.js';
import { objectBox } from '../src/lint/geometry.js';
import { gap } from '../src/lint/describe.js';
import { lintScene } from '../src/lint/rules.js';
import { inspectScene } from '../src/config/buildScene.js';
import { detachPlacement, detachFacing, duplicateObject, objectAt, objectRefs, renameObject } from '../src/editor/tree.js';

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

  it('takes a corner, the centre or a neighbour, each with its own defaults', () => {
    const at = v => objectSchema.parse({ type: 'bench', at: v }).at;
    expect(at({ corner: 'north-east' })).toEqual({ corner: 'north-east', inset: 0, height: 0 });
    expect(at({ corner: 3, inset: 0.5 })).toEqual({ corner: 3, inset: 0.5, height: 0 });
    expect(at({ centre: true })).toEqual({ centre: true, shift: [0, 0], height: 0 });
    expect(at({ near: 'desk' })).toEqual({ near: 'desk', side: 'right', gap: 0.3 });
    expect(at({ near: 'desk', side: 'behind', gap: 1, height: 2 })).toEqual({ near: 'desk', side: 'behind', gap: 1, height: 2 });
  });

  it('wants exactly one form, and only the keys that go with it', () => {
    const msg = at => objectSchema.safeParse({ type: 'bench', at }).error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    expect(msg({ height: 2 })).toEqual(['at: say where: one of "wall", "corner", "centre", "near"']);
    expect(msg({ wall: 'north', corner: 'north-east' })).toEqual(['at: give one of "wall", "corner", "centre", "near", not "wall" and "corner" together']);
    expect(msg({ corner: 'north-east', along: 0.5, gap: 1 })).toEqual(['at.along: "along" goes with "wall", not with "corner"', 'at.gap: "gap" goes with "near", not with "corner"']);
    expect(msg({ corner: 'middle' })).toEqual(['at.corner: a corner is "north-east", "south-east", "south-west", "north-west" or its number in room.footprint']);
    expect(msg({ centre: false })).toEqual(['at.centre: write "centre": true for the middle of the room']);
    expect(msg({ near: 'desk', side: 'above' })).toEqual(['at.side: a side is "left", "right", "front", "behind", "north", "south", "east", "west"']);
  });

  it('takes `facing` in place of `rotation`, and of `turn`', () => {
    const msg = o => objectSchema.safeParse({ type: 'bench', ...o }).error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    expect(objectSchema.parse({ type: 'bench', position: [1, 0, 2], facing: 'west' })).toMatchObject({ facing: 'west', rotation: [0, 0, 0] });
    expect(msg({ facing: 'west', rotation: [0, 90, 0] })).toEqual(['facing: give "facing" or "rotation", not both']);
    expect(msg({ facing: 'west', at: { wall: 'north', turn: 90 } })).toEqual(['at.turn: give "turn" or "facing", not both']);
    expect(msg({ facing: 7 })).toEqual(['facing: a compass direction, "centre" or the "name" of another object']);
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
    // turned round, it is its front (0.71 m deep) that meets the wall: the gap is still the offset
    expect(place({ type: 'wardrobe', at: { wall: 'north', offset: 1, turn: 180 } })).toEqual({ position: [0, 0, -13.29], rotation: [0, 180, 0] });
    // turned sideways, a 5.6 m bench stands 2.8 m out
    expect(place({ type: 'bench', at: { wall: 'north', turn: 90 } })).toEqual({ position: [0, 0, -12.2], rotation: [0, 90, 0] });
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
    expect(placementText({ corner: 'north-east', inset: 0.5, height: 0 })).toBe('north-east corner, 0.5 m in');
    expect(placementText({ corner: 4, inset: 0, height: 0 })).toBe('corner 4');
    expect(placementText({ centre: true, shift: [2, -3], height: 0 })).toBe('the middle of the room, moved 2 m east and 3 m north');
    expect(placementText({ near: 'desk', side: 'front', gap: 1 })).toBe('in front of "desk", 1 m apart');
    expect([facingText('west'), facingText('centre'), facingText('desk')]).toEqual(['west', 'the middle of the room', '"desk"']);
  });

  it('turns an object to a compass direction, whichever local axis its front is', () => {
    expect(place({ type: 'desk', position: [1, 0, 2], facing: 'west' })).toEqual({ position: [1, 0, 2], rotation: [0, -90, 0] });
    expect(place({ type: 'desk', position: [1, 0, 2], facing: 'north-east' }).rotation).toEqual([0, 135, 0]);
    expect([yawTowards([0, 1]), yawTowards([1, 0]), yawTowards([0, -1]), yawTowards([-1, 0])]).toEqual([0, 90, 180, -90]);
    expect(yawTowards([0, -1], '-z')).toBe(0); // seats look north as they are
    // towards the middle of the room, from where it stands
    expect(place({ type: 'desk', position: [0, 0, -10], facing: 'centre' }).rotation).toEqual([0, 0, 0]);
    expect(place({ type: 'bench', position: [8, 0, 0], facing: 'centre' }).rotation).toEqual([0, -90, 0]);
  });

  it('stands an object in a corner, its outline touching both walls', () => {
    expect(place({ type: 'pedestal', at: { corner: 'north-east' } })).toEqual({ position: [7.55, 0, -12.55], rotation: [0, -45, 0] }); // round, 2.45 m radius
    expect(place({ type: 'pedestal', at: { corner: 'south-west', inset: 0.5 } }).position).toEqual([-7.05, 0, 12.05]);
    expect(place({ type: 'desk', at: { corner: 'north-east' }, facing: 'west' })).toEqual({ position: [9.4, 0, -13.7], rotation: [0, -90, 0] });
    // left to itself it looks diagonally into the room, and still touches both walls
    const bench = resolvePlacement(objectSchema.parse({ type: 'bench', at: { corner: 'south-east', inset: 0.25 } }), rect, BUILTIN_REGISTRY, () => {});
    expect(bench.rotation).toEqual([0, -135, 0]);
    const poly = objectBox(bench, BUILTIN_REGISTRY).poly, w = walls(rect.footprint);
    for (const side of ['south', 'east']) expect(gap(poly, [findWall(w, side).wall.a, findWall(w, side).wall.b])).toBeCloseTo(0.25, 2);
  });

  it('names corners by compass, or by vertex number where two share a name; an inner corner holds nothing', () => {
    expect(corners(rect.footprint).map(c => c.name)).toEqual(['north-west corner', 'north-east corner', 'south-east corner', 'south-west corner']);
    expect(corners(loft.footprint).map(c => c.name)).toEqual(['north-west corner', 'north-east corner', 'south-east corner (2)', 'south-east corner (4)', 'south-west corner']);
    expect(place({ type: 'pedestal', at: { corner: 4 } }, loft).position).toEqual([-2.45, 0, 9.55]);
    expect(place({ type: 'pedestal', at: { corner: 'south-east' } }, loft)).toEqual(['at.corner: "south-east" names 2 corners of this room (vertices 2 and 4); give the vertex number']);
    expect(place({ type: 'pedestal', at: { corner: 3 } }, loft)[0]).toMatch(/^at\.corner: corner 3 is an inner corner, nothing can stand in it \(the corners are: north-west corner, /);
    expect(place({ type: 'pedestal', at: { corner: 9 } }, loft)).toEqual(['at.corner: no corner 9 (this room has vertices 0–5)']);
    const tri = withFootprint({ height: 5, footprint: [[0, 0], [10, 0], [0, 10]] });
    expect(findCorner(corners(tri.footprint), 'north-east', 3).error).toMatch(/^this room has no north-east corner \(it has: north-west corner, corner 1, corner 2\)/);
  });

  it('stands an object in the middle of the floor', () => {
    expect(place({ type: 'pedestal', at: { centre: true } })).toEqual({ position: [0, 0, 0], rotation: [0, 0, 0] });
    expect(place({ type: 'pedestal', at: { centre: true, shift: [2, -3], height: 0.2 } }).position).toEqual([2, 0.2, -3]);
    expect(place({ type: 'pedestal', at: { centre: true } }, loft).position).toEqual([-2, 0, -2]); // the L's centre of area
  });
});

describe('placeAll: objects that refer to each other', () => {
  const run = list => {
    const errors = [];
    const out = placeAll(list.map((o, i) => ({ obj: objectSchema.parse(o), fail: (path, msg) => errors.push(`${i}.${path}: ${msg}`) })), rect, BUILTIN_REGISTRY);
    return { errors, out, at: i => ({ position: out[i].position, rotation: out[i].rotation }) };
  };
  const desk = { type: 'desk', name: 'desk', position: [0, 0, 0] }; // 2.6 wide, z −0.6…1.34, faces south

  it('puts one next to another: its side as seen from the front, the gap between their outlines, centres in line', () => {
    const r = run([desk, { type: 'bench', at: { near: 'desk', side: 'right', gap: 0.5 } }, { type: 'bench', at: { near: 'desk', side: 'left' } }, { type: 'bench', at: { near: 'desk', side: 'north', gap: 1 } }]);
    expect(r.errors).toEqual([]);
    expect(r.at(1)).toEqual({ position: [4.6, 0, 0.37], rotation: [0, 0, 0] });   // 1.3 + 0.5 + 2.8 east; the desk's centre is 0.37 south of its origin
    expect(r.at(2).position).toEqual([-4.4, 0, 0.37]);
    expect(r.at(3).position).toEqual([0, 0, -2.05]);                              // 0.6 + 1 + 0.45 north
    expect(r.out[0]).toBe(r.out[0]);
  });

  it('follows the neighbour when that one is placed in words too, whatever the order in the file', () => {
    const r = run([{ type: 'bench', name: 'seat', at: { near: 'desk', side: 'front', gap: 1 }, facing: 'desk' }, { ...desk, position: undefined, at: { wall: 'north' } }]);
    expect(r.errors).toEqual([]);
    expect(r.at(1)).toEqual({ position: [0, 0, -14.4], rotation: [0, 0, 0] });
    expect(r.at(0)).toEqual({ position: [0, 0, -11.61], rotation: [0, 180, 0] }); // 1.34 + 1 + 0.45 in front, looking back at it
  });

  it('keeps two wall objects on their wall, at the same height', () => {
    const r = run([{ type: 'pictureFrame', name: 'first', at: { wall: 'north', height: 3 } }, { type: 'pictureFrame', at: { near: 'first', side: 'right', gap: 1 } }, { type: 'pictureFrame', at: { near: 'first', side: 'left', gap: 1, height: 4 } }]);
    expect(r.at(1)).toEqual({ position: [3.9, 3, -15], rotation: [0, 0, 0] });
    expect(r.at(2).position).toEqual([-3.9, 4, -15]);
  });

  it('lets two objects face each other, and one face the room\'s centre from where `near` put it', () => {
    const r = run([{ type: 'bench', name: 'a', position: [-3, 0, 0], facing: 'b' }, { type: 'bench', name: 'b', position: [3, 0, 0], facing: 'a' }, { type: 'bench', at: { near: 'a', side: 'north', gap: 2 }, facing: 'centre' }]);
    expect(r.errors).toEqual([]);
    expect([r.at(0).rotation, r.at(1).rotation]).toEqual([[0, 90, 0], [0, -90, 0]]);
    const third = objectBox(r.out[2], BUILTIN_REGISTRY);
    expect(third.front[0]).toBeGreaterThan(0.3); // looks south-east, back towards the middle
    expect(third.front[1]).toBeGreaterThan(0.3);
    // the gap is measured along the side's direction, between the two outlines' extents
    const south = Math.max(...third.poly.map(p => p[1])), north = Math.min(...objectBox(r.out[0], BUILTIN_REGISTRY).poly.map(p => p[1]));
    expect(north - south).toBeCloseTo(2, 1);
  });

  it('reports a name nothing has, one that two objects share, itself, and a circle; what leans on a failed object says nothing more', () => {
    expect(run([desk, { type: 'bench', at: { near: 'table' } }]).errors).toEqual(['1.at.near: no object is named "table" (named objects: desk)']);
    expect(run([{ type: 'bench', facing: 'table' }]).errors).toEqual(['0.facing: no object is named "table" (no object in this scene has a "name"; give one to the object you mean)']);
    expect(run([desk, desk, { type: 'bench', at: { near: 'desk' } }]).errors).toEqual(['2.at.near: "desk" names 2 objects; a name that is referred to must be unique']);
    expect(run([{ type: 'bench', name: 'a', at: { near: 'a' } }]).errors).toEqual(['0.at.near: "a" is this object itself']);
    const circle = run([{ type: 'bench', name: 'a', at: { near: 'b' } }, { type: 'bench', name: 'b', at: { near: 'a' } }, { type: 'bench', at: { near: 'b' } }]);
    expect(circle.errors).toEqual([
      '0.at.near: these objects stand next to each other in a circle: "a" → "b" → "a"; give one of them a position',
      '1.at.near: these objects stand next to each other in a circle: "a" → "b" → "a"; give one of them a position',
    ]);
    expect(circle.out.map(o => !!o.unplaced)).toEqual([true, true, true]);
    const chain = run([{ type: 'door', name: 'door', at: { wall: 9 } }, { type: 'bench', at: { near: 'door' } }, { type: 'bench', position: [1, 0, 1], facing: 'door' }]);
    expect(chain.errors).toEqual(['0.at.wall: no wall 9 (this room has edges 0–3)']);
    expect(chain.out.map(o => !!o.unplaced)).toEqual([true, true, true]);
  });

  it('leaves objects that say neither `at` nor `facing` untouched', () => {
    const plain = objectSchema.parse({ type: 'bench', position: [1, 0, 2], rotation: [10, 20, 0] });
    expect(placeAll([{ obj: plain, fail: () => {} }, { obj: objectSchema.parse(desk), fail: () => {} }], rect, BUILTIN_REGISTRY)[0]).toBe(plain);
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

  it('resolves across files: scenery next to a stop\'s object, a stop\'s object facing the scenery', async () => {
    const m = files(
      [{ type: 'bench', name: 'seat', at: { near: 'plinth', side: 'south', gap: 1 }, facing: 'plinth' }],
      [{ type: 'pedestal', name: 'plinth', at: { centre: true }, facing: 'seat' }],
    );
    const { scene, pois } = await buildScene(opts(m));
    expect(scene.decor[0]).toMatchObject({ position: [0, 0, 3.9], rotation: [0, 180, 0] }); // 2.45 + 1 + 0.45 south of the middle
    expect(pois[0].objects[0]).toMatchObject({ position: [0, 0, 0], rotation: [0, 0, 0] });
    expect(pois[0].camera.target[0]).toBeCloseTo(0);                                       // the automatic camera follows the placed object
    expect(await lintScene(await inspectScene(opts(m)), { files: m })).toEqual([]);
  });

  it('a bad reference is one config line; the object is not then checked where it is not', async () => {
    const m = files([{ type: 'bench', at: { near: 'nothing' } }, { type: 'bench', position: [0, 0, 8], facing: 'nothing' }], [{ type: 'pedestal', name: 'plinth', at: { centre: true } }]);
    const e = await buildScene(opts(m)).catch(err => err);
    expect(e.lines).toEqual([
      's/scene.json › decor.0.at.near: no object is named "nothing" (named objects: plinth)',
      's/scene.json › decor.1.facing: no object is named "nothing" (named objects: plinth)',
    ]);
    // left at the origin, the first bench would stand in the plinth: no OBJ_OVERLAP for an object that is not placed
    expect((await lintScene(await inspectScene(opts(m)), { files: m })).map(f => f.code)).toEqual(['CONFIG', 'CONFIG']);
  });

  it('editor: a copy of an object placed in words moves the way its form allows; converting drops the words', () => {
    const m = files([
      { type: 'bench', at: { corner: 'north-east' } }, { type: 'bench', at: { centre: true, shift: [1, 2] } },
      { type: 'bench', name: 'seat', at: { near: 'plinth', side: 'south' }, facing: 'plinth' }, { type: 'bench', position: [5, 0, 5], facing: 'seat' },
    ], [{ type: 'pedestal', name: 'plinth' }]);
    expect(objectAt(duplicateObject(m, 'decor:0').files, 'decor:1').at).toEqual({ corner: 'north-east', inset: 1 });
    expect(objectAt(duplicateObject(m, 'decor:1').files, 'decor:2').at).toEqual({ centre: true, shift: [2, 2] });
    expect(objectAt(duplicateObject(m, 'decor:2').files, 'decor:3')).toMatchObject({ name: 'seat copy', at: { near: 'plinth', side: 'south', gap: 1.3 } });
    expect(objectAt(detachPlacement(m, 'decor:2', { position: [0, 0, 4], rotation: [0, 180, 0] }), 'decor:2')).toEqual({ type: 'bench', name: 'seat', position: [0, 0, 4], rotation: [0, 180, 0] });
    expect(objectAt(detachFacing(m, 'decor:3', [0, -45, 0]), 'decor:3')).toEqual({ type: 'bench', position: [5, 0, 5], rotation: [0, -45, 0] });
  });

  it('editor: renaming an object takes along what stands next to it or faces it', () => {
    const m = files([{ type: 'bench', name: 'seat', at: { near: 'plinth' }, facing: 'plinth' }, { type: 'bench', position: [5, 0, 5], facing: 'seat' }], [{ type: 'pedestal', name: 'plinth' }]);
    expect(objectRefs(m, 'plinth')).toEqual([{ key: 'decor:0', path: ['at', 'near'], label: 'seat' }, { key: 'decor:0', path: ['facing'], label: 'seat' }]);
    expect(objectRefs(m, 'north')).toEqual([]);
    const renamed = renameObject(m, 'poi/a.json:0', 'Statue');
    expect(objectAt(renamed, 'decor:0')).toMatchObject({ at: { near: 'Statue' }, facing: 'Statue' });
    expect(objectAt(renameObject(renamed, 'decor:0', 'Stool'), 'decor:1').facing).toBe('Stool');
    // taking the name away leaves the references for the loader to report
    expect(objectAt(renameObject(m, 'poi/a.json:0', ''), 'decor:0').at.near).toBe('plinth');
  });
});
