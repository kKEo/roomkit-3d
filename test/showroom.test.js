import { describe, it, expect } from 'vitest';
import { inspectScene, readerFromMap } from '../src/config/buildScene.js';
import { inspectFindings, formatFinding } from '../src/lint/rules.js';
import { showroomFiles, catalogFile } from '../src/lint/showroom.js';
import { newSceneFiles } from '../src/editor/bundle.js';
import { parseCatalog } from '../src/editor/catalog.js';

/** A box-shaped scene prefab in memory: `mount` says what it sits on, `[w, h, d]` how big it is. */
const boxes = {
  floor: (w, h, d) => ({ min: [-w / 2, 0, -d / 2], max: [w / 2, h, d / 2] }),
  wall: (w, h, d) => ({ min: [-w / 2, -h / 2, 0], max: [w / 2, h / 2, d] }),
  ceiling: (w, h, d) => ({ min: [-w / 2, -h, -d / 2], max: [w / 2, 0, d / 2] }),
  free: (w, h, d) => ({ min: [-w / 2, -h / 2, -d / 2], max: [w / 2, h / 2, d / 2] }),
};
const prefab = (mount, [w, h, d], extra = {}) => ({
  meta: ({ z }) => ({
    schema: z.strictObject({ shade: z.boolean().default(true).describe('whether it has one') }),
    hotspots: ['body'],
    geometry: () => ({ ...boxes[mount](w, h, d), mount }),
    // hints a showroom must not lean on: this camera would stand under the floor
    placement: () => ({ focus: [0, 0, 0], cameraDistance: 3, cameraHeight: -4, markerOffset: [0, -9, 0] }),
    ...extra,
  }),
  component: ({ h: el, Solid }) => () => el(Solid, { hotspot: 'body' }),
});

const KINDS = [
  ['sofa', 'floor', [2.6, 0.9, 1.1], { title: 'Sofa', blurb: 'a three-seat sofa', glyph: '▂' }], ['frame', 'wall', [1.2, 1.6, 0.1]], ['pendant', 'ceiling', [0.6, 1.4, 0.6]],
  ['orb', 'free', [1, 1, 1]], ['shelf', 'floor', [3.2, 4.4, 0.5]], ['doorway', 'wall', [2.4, 4.2, 0.4], { geometry: () => ({ min: [-1.2, 0, 0], max: [1.2, 4.2, 0.4], mount: 'wall' }) }],
  ['rug', 'floor', [9, 0.05, 6]], ['plant', 'floor', [0.8, 1.6, 0.8]], ['banner', 'wall', [6, 1, 0.05]], ['fan', 'ceiling', [2.4, 0.5, 2.4]], ['stool', 'floor', [0.5, 0.6, 0.5]], ['totem', 'floor', [1, 5.5, 1]],
];

/** A new scene that declares the first `n` kinds; `{ files, own, modules }`. */
async function pack(n, sceneOver = {}) {
  const kinds = KINDS.slice(0, n), modules = new Map(kinds.map(([type, mount, size, extra]) => [`mem://pack/prefabs/${type}.js`, prefab(mount, size, extra)]));
  const files = newSceneFiles('Sample pack');
  files.set('scene.json', `${JSON.stringify({ ...JSON.parse(files.get('scene.json')), prefabs: Object.fromEntries(kinds.map(([type]) => [type, `prefabs/${type}.js`])), ...sceneOver }, null, 2)}\n`);
  const opts = f => ({ name: 'pack', read: readerFromMap(f), resolveUrl: p => `mem://pack/${p}`, loadModule: async url => modules.get(url) });
  const { registry } = await inspectScene(opts(files));
  const own = kinds.map(([type]) => ({ type, path: `prefabs/${type}.js`, entry: registry.extra[type] }));
  return { files, own, opts };
}

/** The scene as the showroom leaves it, and what the checks say about it. */
async function shown(n, sceneOver) {
  const { files, own, opts } = await pack(n, sceneOver);
  const made = showroomFiles({ name: 'pack', files, own });
  const next = new Map([...files, ...made.files]);
  for (const p of made.removed) next.delete(p);
  const built = await inspectScene(opts(next));
  const { findings } = await inspectFindings(built, { files: next, exists: async p => next.has(p) || p.endsWith('.js') });
  return { made, next, built, findings: findings.map(formatFinding) };
}

describe('showroom: a room that shows each of a scene\'s own types', () => {
  it.each([1, 5, 12])('%i types of mixed mounts: it builds, and the checks find nothing', async n => {
    const { made, built, findings } = await shown(n);
    expect(built.errors).toEqual([]);
    expect(findings).toEqual([]);
    expect(built.pois.map(p => p.id)).toEqual(KINDS.slice(0, n).map(k => k[0]));
    expect(made.files.has('prefabs/catalog.json')).toBe(true);
  });

  it('one row along the north wall; a second along the south wall once it would pass 48 m', async () => {
    const few = await shown(5), many = await shown(12);
    const walls = r => r.built.pois.map(p => p.objects[0].at.wall);
    expect(new Set(walls(few))).toEqual(new Set(['north']));
    expect(walls(many)).toEqual([...new Array(6).fill('north'), ...new Array(6).fill('south')]);
    expect(few.made.summary[0]).toBe('pack: a 28 × 13 m room, 7 m high, with 5 stops: sofa, frame, pendant, orb, shelf');
    expect(many.built.scene.room.width).toBeLessThan(48);
    expect(many.built.scene.room.height).toBe(8); // the 5.5 m totem needs head room
    expect(many.built.scene.room.lights.length).toBeGreaterThan(2);
  });

  it('places each type by what it stands on, with a camera that sees all of it whatever its own hints say', async () => {
    const { built } = await shown(6);
    const by = Object.fromEntries(built.pois.map(p => [p.id, p]));
    expect(by.sofa.objects[0].at).toMatchObject({ wall: 'north', offset: 0.6 });
    expect(by.sofa.objects[0].position[1]).toBe(0);
    expect(by.frame.objects[0].at.height).toBeCloseTo(2.4);            // a frame hangs with its middle at eye height
    expect(by.doorway.objects[0].at.height).toBe(0);                    // a wall object that starts at the floor stands on it
    expect(by.pendant.objects[0].position[1]).toBe(built.scene.room.height);
    expect(by.orb.objects[0].position[1]).toBeCloseTo(1.4);
    for (const p of built.pois) {
      expect(p.camera.position[1], p.id).toBeGreaterThan(1);
      expect(p.marker.position[1], p.id).toBeGreaterThan(0);
      expect(p.camera.position[2], p.id).toBeGreaterThan(p.camera.target[2]); // south of what it looks at on the north wall
    }
  });

  it('writes a page per type from its meta, and keeps a page that is already there', async () => {
    const { files, own } = await pack(2);
    const first = showroomFiles({ name: 'pack', files, own });
    expect(first.files.get('content/sofa.md')).toBe([
      '# Sofa', '', 'A three-seat sofa. Type `sofa`: it stands on the floor and is 2.6 m wide, 0.9 m high and 1.1 m deep with its default settings.', '',
      '| Setting | Type | Default | |', '| --- | --- | --- | --- |', '| `shade` | boolean | `true` | whether it has one |', '',
      'Clickable parts: `body`.', '',
    ].join('\n'));
    expect(JSON.parse(first.files.get('poi/sofa.json'))).toMatchObject({ id: 'sofa', label: 'Sofa', kicker: 'stands on the floor', content: { markdown: 'content/sofa.md' } });
    const again = showroomFiles({ name: 'pack', files: new Map([...files, ...first.files, ['content/sofa.md', '# My sofa\n']]), own });
    expect(again.files.has('content/sofa.md')).toBe(false);
    expect(again.summary).toContain('kept as written: content/sofa.md, content/frame.md');
  });

  it('changes the room and the stop list in scene.json and leaves the rest as written', async () => {
    const { made, next } = await shown(3, { theme: { accent: '#ffb000' }, room: { width: 20, height: 7, depth: 20, lights: [[0, 6.6, 0]], footprint: [[-5, -5], [5, -5], [0, 5]], pillars: [[0, 0]] }, camera: { start: 'start', fov: 60 } });
    const scene = JSON.parse(next.get('scene.json'));
    expect(scene.theme).toEqual({ accent: '#ffb000' });
    expect(scene.room).toEqual({ width: 17, height: 7, depth: 12, lights: [[-4.25, 6.6, 0], [4.25, 6.6, 0]], skirting: [0.35] });
    expect(scene.camera).toEqual({ fov: 60, intro: { position: [0, 6.3, 16.2], target: [0, 2.3, 0], duration: 3200 } });
    expect(scene.poi).toEqual(['poi/sofa.json', 'poi/frame.json', 'poi/pendant.json']);
    expect(made.removed).toEqual(['poi/start.json', 'content/start.md']);
    expect(made.summary).toContain('removed the untouched first stop of a new scene: poi/start.json, content/start.md');
  });

  it('leaves a first stop that was edited, and scenery, where they are, and says so', async () => {
    const { files, own } = await pack(1, { decor: [{ type: 'bench', position: [0, 0, 4] }] });
    files.set('content/start.md', '# Welcome\n');
    const made = showroomFiles({ name: 'pack', files, own });
    expect(made.removed).toEqual(['poi/start.json']);
    expect(made.summary.slice(-2)).toEqual([
      'removed the untouched first stop of a new scene: poi/start.json',
      'the scene\'s 1 scenery object (decor) stay where they were: the check will say if one is in the way',
    ]);
    const edited = new Map(files).set('poi/start.json', files.get('poi/start.json').replace('"Start"', '"Entrance"'));
    expect(showroomFiles({ name: 'pack', files: edited, own }).summary).toContain('no longer in the tour (the files are left where they are): poi/start.json');
  });

  it('needs a type to show', async () => {
    const { files } = await pack(0);
    expect(() => showroomFiles({ name: 'pack', files, own: [] })).toThrow('pack has no object types of its own: declare one in scene.json › prefabs (node tools/scene.js prefab new pack <type>)');
  });
});

describe('the catalog of a scene\'s own types', () => {
  it('lists each with what its meta says, in the editor\'s format, relative to the catalog', async () => {
    const { own } = await pack(2);
    const text = catalogFile({ own: [...own, { ...own[1], type: 'kiosk', path: 'lib/kiosk.js' }], title: 'Sample pack objects' });
    expect(text).toBe([
      '{', '  "roomkit": 1,', '  "title": "Sample pack objects",', '  "prefabs": [',
      '    { "type": "sofa", "url": "sofa.js", "title": "Sofa", "blurb": "a three-seat sofa", "glyph": "▂" },',
      '    { "type": "frame", "url": "frame.js" },', '    { "type": "kiosk", "url": "../lib/kiosk.js" }', '  ]', '}', '',
    ].join('\n'));
    expect(parseCatalog(text, 'https://x.test/scenes/pack/prefabs/catalog.json').prefabs.map(p => p.url)).toEqual([
      'https://x.test/scenes/pack/prefabs/sofa.js', 'https://x.test/scenes/pack/prefabs/frame.js', 'https://x.test/scenes/pack/lib/kiosk.js',
    ]);
  });

  it('keeps its title and the entries for modules that are not this scene\'s files', async () => {
    const { own } = await pack(1);
    const previous = JSON.stringify({ roomkit: 1, title: 'Acme furniture', prefabs: [
      { type: 'sofa', url: 'sofa.js', title: 'Old sofa' }, { type: 'gone', url: 'gone.js' },
      { type: 'projector', url: '../../cinema/prefabs/projector.js', title: 'Projector' }, { type: 'kiosk', url: 'https://cdn.example.com/kiosk@1.2.0.js' },
    ] });
    const doc = JSON.parse(catalogFile({ own, previous, title: 'ignored' }));
    expect(doc.title).toBe('Acme furniture');
    expect(doc.prefabs).toEqual([
      { type: 'sofa', url: 'sofa.js', title: 'Sofa', blurb: 'a three-seat sofa', glyph: '▂' },
      { type: 'projector', url: '../../cinema/prefabs/projector.js', title: 'Projector' }, { type: 'kiosk', url: 'https://cdn.example.com/kiosk@1.2.0.js' },
    ]);
  });

  it('is checked with the scene: unreadable, naming a missing module, or missing a type the scene ships', async () => {
    const { files, own, opts } = await pack(2);
    const made = showroomFiles({ name: 'pack', files, own });
    const check = async catalog => {
      const next = new Map([...files, ...made.files, ['prefabs/catalog.json', catalog]]);
      next.delete('poi/start.json');
      const { findings } = await inspectFindings(await inspectScene(opts(next)), { files: next, exists: async p => p === 'prefabs/sofa.js' || p === 'prefabs/frame.js' });
      return findings.map(f => `${f.level} ${f.code} ${f.path}: ${f.message}`);
    };
    expect(await check(made.files.get('prefabs/catalog.json'))).toEqual([]);
    expect(await check('{ "roomkit": 2, "prefabs": [] }')).toEqual(['error CATALOG : the editor cannot read this catalog: "roomkit" must be 1 (the catalog format this editor reads), not 2']);
    expect(await check(JSON.stringify({ roomkit: 1, prefabs: [{ type: 'sofa', url: 'sofa.js' }, { type: 'frame', url: 'frame.js' }, { type: 'ghost', url: 'ghost.js' }] }))).toEqual(['error CATALOG prefabs.2.url: "ghost" names a module that is not in the folder']);
    expect(await check(JSON.stringify({ roomkit: 1, prefabs: [{ type: 'sofa', url: 'sofa.js' }] }))).toEqual(['warn CATALOG prefabs: the scene\'s own type "frame" is not in its catalog']);
  });
});
