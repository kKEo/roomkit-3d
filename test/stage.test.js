import { describe, it, expect } from 'vitest';
import { openStage, moved } from '../src/lint/stage.js';
import { sdkCore, SDK_BROWSER_KEYS } from '../src/prefabs/sdkCore.js';
import { makeSdk } from '../src/prefabs/sdk.js';
import { loadScene } from '../tools/scene/load.js';
import { describePrefab, prefabTemplate, viewText, MOUNT_NAMES } from '../src/lint/prefabDescribe.js';
import { lintPrefab } from '../src/lint/prefabRules.js';
import { loadPrefab } from '../src/config/buildScene.js';

const own = async (scene, type) => (await loadScene(scene)).scene.registry.extra[type];
const r = v => v.map(x => Math.round(x * 100) / 100);

describe('the stage: a scene prefab rendered without a browser', () => {
  it('hands the prefab the same SDK a page does: the core plus the keys only a page can give', async () => {
    const page = Object.keys(makeSdk('file:///x/lamp.js')).sort();
    expect(page).toEqual([...Object.keys(sdkCore('file:///x/lamp.js')), ...SDK_BROWSER_KEYS].sort());
    const stage = await openStage(await own('loft', 'lamp'));
    expect(Object.keys(stage.sdk).sort()).toEqual(page);
    await stage.close();
  });

  it('lamp: three solids and a set of rays; the box its meta declares is the box it makes; the shade turns', async () => {
    const lamp = await own('loft', 'lamp'), stage = await openStage(lamp);
    expect(await stage.render(lamp.props)).toBe(true);
    const parts = stage.parts();
    expect(parts.map(p => [p.kind, p.shape, p.hotspot])).toEqual([['solid', 'cylinder', null], ['solid', 'cylinder', null], ['solid', 'cone', 'shade'], ['lines', null, null]]);
    const m = stage.measure(), g = lamp.geometry(lamp.props);
    expect([r(m.body.min), r(m.body.max)]).toEqual([g.min, g.max]);
    expect(r(m.lines.max)).toEqual([0.9, 1.55, 0.9]); // the rays reach past the body and are not part of it
    expect([...stage.asked]).toEqual(['shade']);
    expect(parts.some(p => p.foreign)).toBe(false);

    const before = stage.snapshot();
    await stage.frames(10);
    expect(moved(before, stage.snapshot(), parts).map(p => p.shape)).toEqual(['cone']);
    // a prop changes: the same component re-renders, as it would in the editor
    expect(await stage.render({ ...lamp.props, height: 3, lit: false })).toBe(true);
    expect(stage.measure().body.max[1]).toBeCloseTo(3.25);
    expect(stage.measure().lines).toBe(null);
    expect(stage.messages).toEqual([]);
    await stage.close();
  });

  it('with reduced motion nothing moves', async () => {
    const lamp = await own('loft', 'lamp'), stage = await openStage(lamp, { reducedMotion: true });
    await stage.render(lamp.props);
    const before = stage.snapshot();
    await stage.frames(10);
    expect(moved(before, stage.snapshot(), stage.parts())).toEqual([]);
    await stage.close();
  });

  it('seats: backrests lean in a turned group and are measured where they end up; the outline-only row counts as body', async () => {
    const seats = await own('cinema', 'seats'), stage = await openStage(seats);
    await stage.render(seats.props);
    expect(stage.parts().filter(p => p.kind === 'outline').map(p => [p.shape, p.hotspot, r(p.box.max)])).toEqual([['box', 'row', [3.4, 0.05, 0.95]]]);
    expect(stage.measure().body.max[2]).toBeCloseTo(1.09, 1);
    await stage.render(seats.schema.parse({ recline: 60 }));
    expect(stage.measure().body.max[2]).toBeCloseTo(1.7, 1);
    await stage.close();
  });

  it('projector: the beam is lines, 20 m long, and no part of the body', async () => {
    const projector = await own('cinema', 'projector'), stage = await openStage(projector);
    await stage.render(projector.props);
    const m = stage.measure();
    expect(r(m.body.min)).toEqual([-0.65, -1.55, -1.3]);
    expect(m.lines.min[2]).toBeCloseTo(-20);
    await stage.close();
  });

  it('the shipped prefabs pass every check', async () => {
    for (const [scene, type] of [['loft', 'lamp'], ['cinema', 'seats'], ['cinema', 'projector']]) {
      expect(await lintPrefab({ type, entry: await own(scene, type), file: `${scene}/prefabs/${type}.js` }), type).toEqual([]);
    }
  });
});

describe('prefab describe and the template', () => {
  it('reads the lamp back: what is declared, what is measured, each part, what is clickable and what moves', async () => {
    const { lines, svg } = await describePrefab('lamp', await own('loft', 'lamp'));
    expect(lines.slice(0, 11)).toEqual([
      'lamp: "Floor lamp", a lamp on a pole whose shade turns',
      'declared: a floor object, faces +z; 0.8 wide × 2.05 high × 0.8 deep (round): x -0.4…0.4, y 0…2.05, z -0.4…0.4',
      'measured: its solid parts are 0.8 wide × 2.05 high × 0.8 deep: x -0.4…0.4, y 0…2.05, z -0.4…0.4; lines reach x -0.9…0.9, y 0…2.05, z -0.9…0.9',
      'props: {"height":1.8,"lit":true,"spin":0.3}',
      'parts (3 solids, 1 line set):',
      '   1  cylinder 0.7 × 0.06 × 0.7 at [0, 0.03, 0]',
      '   2  cylinder 0.05 × 1.8 × 0.06 at [0, 0.9, 0]; line mid',
      '   3  cone 0.8 × 0.5 × 0.8 at [0, 1.8, 0]; fill fine, line mid, clickable as "shade", moves',
      '   4  lines 1.8 × 1.53 × 1.8 at [0, 0.78, 0]; faint',
      'clickable parts: shade',
      'moves on its own: cone (part 3)',
    ]);
    expect(lines.filter(l => /^(front|side|top) \(/.test(l))).toHaveLength(3);
    expect(svg).toMatch(/^<svg [^>]*>\n<title>lamp: &quot;Floor lamp&quot;, a lamp on a pole whose shade turns: front, side and top<\/title>/);
    expect(svg).toContain('stroke-dasharray'); // the declared box
  });

  it('draws a view as text: edges of solids as #, free lines as :', () => {
    const edges = [
      { part: { kind: 'solid' }, index: 0, segments: [0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0] },
      { part: { kind: 'lines' }, index: 1, segments: [0, 0, 0, 1, 1, 0] },
    ];
    const text = viewText(edges, { min: [0, 0, 0], max: [1, 1, 0] }, 'front', 10);
    expect(text[0]).toBe('front (from the front: x runs right, y up; one character is 0.2 m wide, one line 0.4 m):');
    expect(text.slice(1)).toEqual(['  ######', '  # :::#', '  #::  #', '  ######']);
  });

  it.each(MOUNT_NAMES)('a new %s type from the template passes every check as it stands', async mount => {
    const text = prefabTemplate('sideTable', { mount, scene: 'demo' });
    expect(text).toContain('node tools/scene.js prefab check demo sideTable');
    const module = await import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(text)}`);
    const entry = await loadPrefab('sideTable', 'prefabs/sideTable.js', { resolveUrl: p => `file:///demo/${p}`, loadModule: async () => module });
    expect(entry.title).toBe('Side table');
    expect(entry.geometry(entry.props).mount).toBe(mount);
    expect(await lintPrefab({ type: 'sideTable', entry, file: 'demo/prefabs/sideTable.js', source: text })).toEqual([]);
  });
});
