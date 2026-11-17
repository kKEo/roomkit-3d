import { describe, it, expect } from 'vitest';
import { loadScene, sceneNames } from '../tools/scene/load.js';
import { describeScene, describePrefabs, compass, gap } from '../src/lint/describe.js';
import { planText, planSvg } from '../src/lint/plan.js';
import { BUILTIN_REGISTRY } from '../src/prefabs/registry.js';

const { dirs } = await sceneNames();
const loft = await loadScene('loft');

describe('describeScene', () => {
  it('reads the loft back: room, walls, where each object stands, what each camera sees', () => {
    const text = describeScene(loft.scene, loft.pois);
    expect(text.slice(0, 4)).toEqual([
      'loft: "Cyan Loft — an L-shaped room"',
      'room: 24 m east–west by 24 m north–south, 7 m high; x grows east, z grows south, y is up, the floor is y 0',
      'walls: north wall 24 m, east wall (edge 1) 12 m, south wall (edge 2) 12 m, east wall (edge 3) 12 m, south wall (edge 4) 12 m, west wall 24 m',
      'pillars: [-6, 0]; lights: 3',
    ]);
    const line = start => text.find(l => l.trim().startsWith(start));
    expect(line('door (decor:0)')).toBe('  door (decor:0): on the south wall (edge 2), 6 m from its left end of 12 m; from y 0 to 4.4; 2.7 m wide; facing north; nearest: desk (studio:0), 5.3 m north; placed at: wall 2, 50% along; click: door goes to the overview');
    expect(line('desk (studio:0)')).toMatch(/on the floor at \[8, 0, -7\]; 1\.9 m east–west by 2\.6 m north–south, y 0 to 2\.2; facing west; 3\.4 m from the east wall \(edge 1\).*; turned to face: west$/);
    // an object with a name is called by it
    expect(line('left frame (wall:0)')).toMatch(/on the north wall, 7 m from its left end of 24 m/);
    expect(text.at(-2)).toBe('  camera at [-6, 4.8, 11.4] looking north at [-6, 2, 5], 7 m away, 55° tall view');
    expect(text.at(-1)).toMatch(/^ {2}in the picture: pedestal \(wing:0\) \d+% centre/);
  });

  it.each(dirs)('%s: every stop\'s camera has one of its own objects in the picture', async name => {
    const { scene, pois } = name === 'loft' ? loft : await loadScene(name);
    const text = describeScene(scene, pois);
    expect(text.filter(l => l.includes('NOTE:'))).toEqual([]);
    expect(text.filter(l => l.startsWith('stop '))).toHaveLength(pois.length);
  });

  it('opens with the brief the scene was built from, when it is handed one', () => {
    const text = describeScene(loft.scene, loft.pois, { brief: 'An L-shaped loft in cyan.' });
    expect(text.slice(0, 3)).toEqual(['loft: "Cyan Loft — an L-shaped room"', 'brief: An L-shaped loft in cyan.', expect.stringMatching(/^room: 24 m/)]);
  });

  it('marks an object that is partly outside the picture', () => {
    const close = loft.pois.map(p => (p.id === 'wing' ? { ...p, camera: { position: [-6, 2, 8], target: [-6, 2, 5] } } : p));
    expect(describeScene(loft.scene, close).at(-1)).toMatch(/pedestal \(wing:0\) \d+% centre \(cut off\)/);
    expect(describeScene(loft.scene, loft.pois).at(-1)).not.toMatch(/pedestal \(wing:0\) \d+% centre \(cut off\)/);
  });

  it('compass and gap', () => {
    expect([[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1]].map(compass)).toEqual(['north', 'east', 'south', 'west', 'north-east']);
    const sq = (x, z) => [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]];
    expect(gap(sq(0, 0), sq(3, 0))).toBeCloseTo(2);
    expect(gap(sq(0, 0), sq(0.5, 0))).toBe(0);
  });
});

describe('describePrefabs', () => {
  it('lists every type with its mount, size, props and clickable parts', () => {
    const text = describePrefabs(BUILTIN_REGISTRY);
    const i = text.indexOf('bench: a plain bench');
    expect(text.slice(i, i + 4)).toEqual([
      'bench: a plain bench',
      '  floor object, origin on the floor, faces +z; with default props 5.6 wide × 0.7 high × 0.9 deep: x -2.8…2.8, y 0…0.7, z -0.45…0.45',
      '  props: width: number (> 0) = 5.6; height: number (> 0) = 0.7; depth: number (> 0) = 0.9',
      '  clickable parts: bench',
    ]);
    expect(text.filter(l => !l.startsWith(' '))).toHaveLength(BUILTIN_REGISTRY.types().length);
  });

  it('includes a scene\'s own types', () => {
    const text = describePrefabs(loft.scene.registry);
    expect(text).toContain('  floor object, origin on the floor, faces +z; with default props 0.8 wide × 2.05 high × 0.8 deep (round): x -0.4…0.4, y 0…2.05, z -0.4…0.4');
  });
});

describe('plan', () => {
  it('draws the L-shaped loft with its objects and cameras', () => {
    const text = planText(loft.scene, loft.pois);
    expect(text[0]).toBe('loft: north is up, east is right; one character is 0.5 m wide, one line 1 m');
    expect(text.slice(1, 28)).toMatchInlineSnapshot(`
      [
        " ################################################",
        "############DDDDDD#####EEEE#####FFFFFF############",
        "##..........DDDDDD.....EEEE.....FFFFFF..........##",
        "##..............................................##",
        "##..............................................##",
        "##....................................GGGG......##",
        "##...........................2........GGGG......##",
        "##..............................................##",
        "##..............................................##",
        "##..............................................##",
        "##.......................1......................##",
        "##..............................................##",
        "##.........ooo...........############A############",
        "##.........ooo..........#########################",
        "##......................##",
        "##......................##",
        "##........HHHHHH........##",
        "##.......HHHHHHHH.......##",
        "##.......HHHHHHHH.......##",
        "##........HHHHHH........##",
        "##......................##",
        "##..........BB..........##",
        "##..........BB..........##",
        "##...C......BB..........##",
        "#############3############",
        " ########################",
        "",
      ]
    `);
    expect(text).toContain('H  pedestal (wing:0)');
    expect(text).toContain('3  camera of stop "wing"');
  });

  it('a wide room is drawn at a coarser step', () => {
    expect(planText(loft.scene, loft.pois, { maxCols: 30 })[0]).toMatch(/one character is 1 m wide, one line 2 m/);
  });

  it('writes an SVG with one outline per object and a marker per camera', () => {
    const svg = planSvg(loft.scene, loft.pois);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.match(/<polygon/g)).toHaveLength(1 + 1 + 8); // floor, pillar, objects
    expect(svg.match(/<circle/g)).toHaveLength(3);
    expect(svg).toContain('wing:0 pedestal');
  });
});
