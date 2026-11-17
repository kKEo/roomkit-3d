import { describe, it, expect } from 'vitest';
import { parseView, sheetHtml, sheetLayout, splitViews, stillFrom, topView, viewNames, viewPose } from '../src/lib/still.js';
import { loadScene } from '../tools/scene/load.js';
import { framing, objectBox, sceneObjects } from '../src/lint/geometry.js';

const loft = await loadScene('loft');

describe('still mode: reading the address', () => {
  it('is asked for with ?still, and opens on the whole room unless a view is named', () => {
    expect(stillFrom('?scene=loft')).toBe(null);
    expect(stillFrom('?scene=loft&still')).toEqual({ view: 'overview' });
    expect(stillFrom('?still=1&view=studio')).toEqual({ view: 'studio' });
    expect(stillFrom('?still&view=0,3,-3,0,3,-12')).toEqual({ view: '0,3,-3,0,3,-12' });
  });

  it('a view is the overview, the top, a stop or a pose of six numbers', () => {
    expect([parseView(''), parseView('overview'), parseView('top'), parseView(' studio ')]).toEqual([{ kind: 'overview' }, { kind: 'overview' }, { kind: 'top' }, { kind: 'stop', id: 'studio' }]);
    expect(parseView('0, 3,-3, 0,3.5,-12')).toEqual({ kind: 'pose', position: [0, 3, -3], target: [0, 3.5, -12] });
    expect([parseView('1,2,3'), parseView('1,2,3,4,5,x'), parseView('a,b')]).toEqual([null, null, null]);
  });

  it('a list of views is split at the commas, six numbers in a row staying one pose', () => {
    expect(splitViews('overview,studio')).toEqual(['overview', 'studio']);
    expect(splitViews('top, studio ,0,3,-3,0,3,-12,wing')).toEqual(['top', 'studio', '0,3,-3,0,3,-12', 'wing']);
    expect(splitViews('0,3,-3,0,3,-12')).toEqual(['0,3,-3,0,3,-12']);
    expect(splitViews('1,2,3')).toEqual(['1', '2', '3']); // not a pose: each is taken for a stop, and refused as one
    expect(splitViews('')).toEqual([]);
  });
});

describe('still mode: where the camera stands', () => {
  const { scene, pois } = loft;

  it('gives each view its pose', () => {
    expect(viewNames(pois)).toEqual(['overview', 'top', 'wall', 'studio', 'wing']);
    expect(viewPose('overview', scene, pois)).toEqual(scene.camera.overview);
    const studio = viewPose('studio', scene, pois);
    expect([studio.position.map(v => +v.toFixed(3)), studio.target.map(v => +v.toFixed(3))]).toEqual([[2, 2.9, -7], [8, 1.6, -7]]);
    expect(viewPose('0,3,-3,0,3,-12', scene, pois)).toEqual({ position: [0, 3, -3], target: [0, 3, -12] });
  });

  it('says what the views are when it is handed something else', () => {
    expect(viewPose('attic', scene, pois)).toEqual({ error: 'no stop has the id "attic" (views: overview, top, wall, studio, wing)' });
    expect(viewPose('1,2,3', scene, pois)).toEqual({ error: '"1,2,3" is not a view: write overview, top, a stop\'s id, or a pose as x,y,z,tx,ty,tz' });
  });

  it('from the top, every object and every corner of the ceiling is in the picture, north up', () => {
    const top = topView(scene.room, scene.camera.fov);
    expect(top.target).toEqual([0, 0, 0]);
    expect(top.position[1]).toBeGreaterThan(scene.room.height + 2);
    for (const e of sceneObjects(scene, pois)) {
      const f = framing(top, scene.camera.fov, objectBox(e.obj, scene.registry));
      expect([f.visible, f.cut], e.key).toEqual([true, false]);
    }
    // the tops of the walls are the nearest thing to the camera: a slab at ceiling height the size of the room must fit too
    const lid = { poly: [[-12, -12], [12, -12], [12, 12], [-12, 12]], y0: scene.room.height - 0.1, y1: scene.room.height };
    expect(framing(top, scene.camera.fov, lid)).toMatchObject({ visible: true, cut: false });
    // north (−z) is up: the desk in the north-east is above and right of the pedestal in the south-west
    const at = name => framing(top, scene.camera.fov, objectBox(sceneObjects(scene, pois).find(e => e.obj.name === name).obj, scene.registry)).centre;
    expect(at('desk')[0]).toBeGreaterThan(at('pedestal')[0]);
    expect(at('desk')[1]).toBeGreaterThan(at('pedestal')[1]);
    // a wide, low room is fitted by its width
    const hall = topView({ width: 60, depth: 10, height: 5, bounds: { minX: -30, maxX: 30, minZ: -5, maxZ: 5 } }, 55);
    expect(hall.position[1]).toBeCloseTo(5 + (60 * 1.08) / (2 * Math.tan((55 * Math.PI) / 360) * (16 / 9)), 0);
  });
});

describe('the contact sheet', () => {
  it('keeps up to four pictures at their size, two to a row, and puts more three to a row on a sheet of 1600 px', () => {
    expect(sheetLayout(1)).toEqual({ cols: 1, rows: 1, width: 640 });
    expect(sheetLayout(4)).toEqual({ cols: 2, rows: 2, width: 1280 });
    expect(sheetLayout(7)).toEqual({ cols: 3, rows: 3, width: 1600 });
    expect(sheetLayout(5, [480, 270])).toEqual({ cols: 3, rows: 2, width: 1440 });
  });

  it('is a page of labelled pictures', () => {
    const html = sheetHtml('loft: "Cyan" <Loft>', [{ label: 'overview', png: 'AAAA' }, { label: '1 wall: Long & wide', png: 'BBBB' }]);
    expect(html).toContain('<title>loft: &quot;Cyan&quot; &lt;Loft&gt;</title>');
    expect(html).toContain('grid-template-columns: repeat(2, 1fr)');
    expect(html).toContain('<figure><img src="data:image/png;base64,BBBB" alt=""><figcaption>1 wall: Long &amp; wide</figcaption></figure>');
  });
});
