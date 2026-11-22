import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { inspectScene, readerFromMap } from '../src/config/buildScene.js';
import { lintScene } from '../src/lint/rules.js';
import { interiorWalls, wallPieces, wallFaces, roomWalls, route } from '../src/lib/walls.js';
import { withFootprint } from '../src/lib/footprint.js';
import { collide, roomColliders } from '../src/lib/collide.js';
import { flightCurve } from '../src/lib/flight.js';
import { clampCamera } from '../src/lib/autoCamera.js';
import { planText } from '../src/lint/plan.js';
import { describeScene } from '../src/lint/describe.js';

// a 20 × 20 × 8 room split down the middle (x = 0) by a wall with one doorway at z = 4
const SPLIT = { name: 'split', from: [0, -10], to: [0, 10], openings: [{ distance: 14, width: 2, height: 3 }] };
const room = (walls = [SPLIT]) => withFootprint({ width: 20, depth: 20, height: 8, pillars: [], walls: walls.map(w => ({ thickness: 0.2, ...w, openings: (w.openings ?? []).map(o => ({ width: 1.2, height: 2.4, ...o })) })) });

describe('interior walls', () => {
  it('resolve their openings and split into pieces around them, with a lintel over each', () => {
    const [w] = interiorWalls(room());
    expect(w.length).toBe(20);
    expect(w.openings[0]).toMatchObject({ centre: [0, 4], from: 13, to: 15, height: 3 });
    const pieces = wallPieces(room());
    expect(pieces.map(p => [p.a[1], p.b[1], p.y0, p.y1])).toEqual([[-10, 3, 0, 8], [3, 5, 3, 8], [5, 10, 0, 8]]);
    expect(pieces[0].poly.map(([x]) => Math.abs(x))).toEqual([0.1, 0.1, 0.1, 0.1]);
  });

  it('an opening as tall as the wall leaves no lintel, and a lower wall is that high', () => {
    const pieces = wallPieces(room([{ ...SPLIT, height: 3, openings: [{ distance: 14, width: 2, height: 5 }] }]));
    expect(pieces.map(p => [p.y0, p.y1])).toEqual([[0, 3], [0, 3]]);
  });

  it('have two faces, named by the side they look to, half the thickness off the centre line', () => {
    const faces = wallFaces(room());
    expect(faces.map(f => [f.face, f.a[0], f.normal[0]])).toEqual([['east', 0.1, 1], ['west', -0.1, -1]]);
    expect(faces[0].name).toBe('east face of "split"');
    expect(roomWalls(room()).length).toBe(6);
  });
});

describe('flights between rooms', () => {
  const r = room();
  it('go through the doorway when the wall is in the way, and straight on when not', () => {
    expect(route(r, [-5, 2, -5], [-5, 2, 5])).toBeNull(); // same side
    const via = route(r, [-5, 2, -5], [5, 2, -5]);
    expect(via.map(p => p.map(v => Math.round(v * 10) / 10))).toEqual([[-1.4, 2.3, 4], [0, 2.3, 4], [1.4, 2.3, 4]]);
  });

  it('fly over the walls from outside the room, and find no way where there is no doorway', () => {
    expect(route(r, [0, 20, 30], [5, 2, -5])).toBeNull();
    expect(route(room([{ ...SPLIT, openings: [] }]), [-5, 2, -5], [5, 2, -5])).toBeNull();
  });

  it('the flight curve passes the wall only in the doorway, under its top', () => {
    const curve = flightCurve(new THREE.Vector3(-5, 2, -5), new THREE.Vector3(5, 2, -5), { room: r });
    expect(curve.userData.routed).toBe(true);
    const pts = curve.getSpacedPoints(400);
    for (let i = 1; i < pts.length; i++) {
      const [p, q] = [pts[i - 1], pts[i]];
      if (Math.sign(p.x) === Math.sign(q.x)) continue;
      const z = p.z + ((q.z - p.z) * -p.x) / (q.x - p.x);
      expect(z).toBeGreaterThan(3); expect(z).toBeLessThan(5); expect(p.y).toBeLessThan(3);
    }
  });

  it('a hand-flown camera passes the wall through the doorway only', () => {
    const c = roomColliders(r);
    expect(collide(c, { x: -2, y: 2, z: -5 }, { x: 2, y: 2, z: -5 }).x).toBeCloseTo(-0.4);
    expect(collide(c, { x: -2, y: 2, z: 4 }, { x: 2, y: 2, z: 4 }).x).toBeCloseTo(2);
    expect(collide(c, { x: -2, y: 5, z: 4 }, { x: 2, y: 5, z: 4 }).x).toBeCloseTo(-0.4); // the lintel
  });

  it('an automatic camera behind a wall is pulled in front of it', () => {
    const cam = clampCamera({ position: [-6, 2, 0], target: [3, 1, 0] }, r.footprint, 0.6, wallPieces(r));
    expect(cam.position[0]).toBeCloseTo(0.1 + 0.6); // the target's side of the wall
  });
});

/** A 20 × 20 × 8 room split by `split`, one stop; `scene.room` and `poi` are merged in. */
function folder({ walls = [SPLIT], poi = {} } = {}) {
  return new Map(Object.entries({
    'scene.json': JSON.stringify({ room: { width: 20, height: 8, depth: 20, lights: [[-5, 7.6, 0], [5, 7.6, 0]], walls }, poi: ['poi/a.json'] }),
    'poi/a.json': JSON.stringify({
      id: 'a', label: 'A', objects: [{ type: 'bench', name: 'bench', position: [-5, 0, -2] }],
      camera: { position: [-5, 2, 6], target: [-5, 0.5, -2] }, content: { blocks: [{ type: 'heading', text: 'A' }] }, ...poi,
    }),
  }));
}
async function lint(files) {
  const built = await inspectScene({ name: 's', read: readerFromMap(files), resolveUrl: p => `/s/${p}` });
  return { built, findings: await lintScene(built, { files, exists: async p => files.has(p) }) };
}
const codes = ({ findings }) => findings.map(f => f.code).sort();

describe('scene checks with interior walls', () => {
  it('a tidy split room has nothing to report', async () => {
    expect(codes(await lint(folder()))).toEqual([]);
  });

  it('a wall outside the plan, an opening past its end, overlapping openings, a name used twice', async () => {
    const walls = [
      { name: 'w', from: [-9, -10], to: [-9, 14], openings: [{ distance: 23.5, width: 2 }] },
      { name: 'w', from: [9, -10], to: [9, 10], openings: [{ distance: 5 }, { distance: 5.5 }] },
    ];
    expect(codes(await lint(folder({ walls })))).toEqual(['OPENING_OVERLAP', 'OPENING_PAST_END', 'WALL_NAME_TAKEN', 'WALL_OUTSIDE']);
  });

  it('an object in a wall or in a doorway; a camera in a wall or behind one', async () => {
    const objects = [{ type: 'bench', name: 'bench', position: [0, 0, -5], props: { width: 2 } }, { type: 'bench', name: 'b2', position: [0, 0, 4], rotation: [0, 90, 0], props: { width: 1.5 } }];
    expect(codes(await lint(folder({ poi: { objects, camera: { position: [0, 2, 0], target: [-5, 0, -5] } } })))).toEqual(['CAM_IN_WALL', 'OBJ_IN_WALL', 'OPENING_BLOCKED']);
    expect(codes(await lint(folder({ poi: { camera: { position: [5, 2, -2], target: [-5, 0.5, -2] } } })))).toContain('CAM_BLOCKED');
  });

  it('places objects on a face, and says what is missing when the face is not given or wrong', async () => {
    const frame = at => ({ type: 'pictureFrame', name: 'frame', at });
    const ok = await lint(folder({ poi: { objects: [frame({ wall: 'split', face: 'west', along: 0.5, height: 3 })], camera: { position: [-6, 3, 0], target: [0, 3, 0] } } }));
    expect(codes(ok)).toEqual([]);
    expect(ok.built.pois[0].objects[0]).toMatchObject({ position: [-0.1, 3, 0], rotation: [0, -90, 0] });
    const lines = async at => (await lint(folder({ poi: { objects: [frame(at)] } }))).findings.filter(f => f.code === 'CONFIG').map(f => `${f.path}: ${f.message}`);
    expect(await lines({ wall: 'split' })).toEqual(['objects.0.at.face: say which face of "split": "east" or "west"']);
    expect(await lines({ wall: 'split', face: 'north' })).toEqual(['objects.0.at.face: "split" has no north face (its faces look east and west)']);
    expect(await lines({ wall: 'splt' })).toEqual(['objects.0.at.wall: no wall "splt": did you mean "split"? (a wall is "north", "south", "east", "west", its number in room.footprint or an interior wall: "split")']);
    expect(await lines({ wall: 'north', face: 'south' })).toEqual(['objects.0.at.wall: "face" is only for an interior wall; the north wall has one side']);
  });

  it('the plan draws the wall with its doorway, and the read-back lists it', async () => {
    const { built } = await lint(folder());
    const rows = planText(built.scene, built.pois).slice(1, 24);
    const mid = rows.map(r => r[21]).join('');
    expect(mid).toMatch(/#+\.+#+/); // wall, doorway, wall
    expect(describeScene(built.scene, built.pois).join('\n')).toContain('interior wall "split": [0, -10] to [0, 10], 20 m, 0.2 m thick, 8 m high; faces east and west; openings: 2 m wide and 3 m high, 13–15 m from the [0, -10] end');
  });
});
