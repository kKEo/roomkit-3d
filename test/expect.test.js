import { describe, it, expect } from 'vitest';
import { buildScene, readerFromMap } from '../src/config/buildScene.js';
import { checkBrief, EXPECTATIONS, briefFile } from '../src/lint/expect.js';
import { inspectScene } from '../src/config/buildScene.js';
import { inspectFindings } from '../src/lint/rules.js';

/**
 * A 20 × 30 m room (walls at x ±10, z ±15): a desk in the north-east corner facing west, three frames on the north
 * wall, a plinth in the middle that the only stop looks at from the south, a bench south of it, a door in the south wall.
 */
const files = (brief, over = {}) => new Map(Object.entries({
  'scene.json': JSON.stringify({
    room: { width: 20, height: 8, depth: 30, lights: [[0, 7.6, 0]] },
    decor: [
      { type: 'desk', name: 'desk', at: { corner: 'north-east' }, facing: 'west', ...over.desk },
      { type: 'pictureFrame', name: 'left', at: { wall: 'north', along: 0.2, height: 3 } },
      { type: 'pictureFrame', name: 'middle', at: { wall: 'north', along: 0.4, height: 3 } },
      { type: 'pictureFrame', at: { wall: 'north', along: 0.6, height: 3 } },
      { type: 'door', name: 'door', at: { wall: 'south' }, actions: { door: { type: 'goTo', poi: null } } },
      { type: 'bench', name: 'bench', at: { near: 'plinth', side: 'south', gap: 1 } },
      { type: 'primitive', position: [-8, 1, 10] }, { type: 'primitive', name: 'twin', position: [-8, 1, 12] }, { type: 'primitive', name: 'twin', position: [-6, 1, 12] },
    ],
    poi: ['poi/a.json'],
  }),
  'poi/a.json': JSON.stringify({ id: 'hall', label: 'Hall', objects: [{ type: 'pedestal', name: 'plinth', at: { centre: true } }], camera: { position: [0, 3.4, 12.5], target: [0, 2.9, 0] }, content: { blocks: [{ type: 'heading', text: 'Hall' }] } }),
  ...(brief === undefined ? {} : { 'brief.json': typeof brief === 'string' ? brief : JSON.stringify(brief) }),
}));
const opts = m => ({ name: 's', read: readerFromMap(m), resolveUrl: p => p });

/** The findings of one expectation, as `CODE: message`; an empty list when it holds. */
async function check(e, over) {
  const m = files({ text: 'the brief', expect: [e] }, over);
  const { scene, pois } = await buildScene(opts(m));
  return checkBrief(scene, pois, m.get('brief.json')).findings.map(f => `${f.code.replace('EXPECT_', '')}: ${f.message}`);
}

describe('brief.json: expectations that hold', () => {
  it.each([
    [{ object: 'desk', corner: 'north-east' }], [{ object: 'desk', corner: 1, within: 0.5 }], [{ object: 'desk', facing: 'west' }], [{ object: 'desk', facing: 'left' }],
    [{ object: 'left', wall: 'north' }], [{ object: 'left', wall: 0 }], [{ object: 'bench', wall: 'south', within: 12 }],
    [{ object: 'plinth', centre: true }], [{ object: 'plinth', centre: true, within: 0.1 }],
    [{ object: 'bench', near: 'plinth' }], [{ object: 'bench', near: 'plinth', within: 1, atLeast: 1 }], [{ object: 'desk', near: 'door', atLeast: 10 }],
    [{ object: 'bench', side: 'south', of: 'plinth' }], [{ object: 'bench', side: 'front', of: 'plinth' }], [{ object: 'left', side: 'left', of: 'middle' }], [{ object: 'left', side: 'west', of: 'middle' }],
    [{ object: 'bench', facing: 'south' }], [{ object: 'door', facing: 'centre' }], [{ object: 'door', facing: 'plinth' }],
    [{ object: 'door', click: 'door', goTo: null }], [{ object: 'door', click: 'door', action: 'goTo' }],
    [{ stop: 'hall', sees: ['plinth'], share: 0.05 }], [{ stop: 'hall', sees: ['left', 'desk'], share: 0.001 }], [{ stop: 'hall', order: ['left', 'middle', 'desk'] }],
    [{ count: 'pictureFrame', is: 3 }], [{ count: 'pictureFrame', is: 3, wall: 'north' }], [{ count: 'pedestal', is: 1, stop: 'hall' }], [{ count: 'pictureFrame', is: 0, stop: 'hall' }], [{ count: 'wardrobe', is: 0 }],
    [{ room: { width: 20, depth: 30, height: 8 } }], [{ room: { height: 8 } }], [{ stops: ['hall'] }],
  ])('%j', async e => { expect(await check(e)).toEqual([]); });
});

describe('brief.json: expectations that do not hold say what is true instead', () => {
  it.each([
    [{ object: 'desk', corner: 'south-west' }, 'FAILED: "desk" is 32.8 m from the south-west corner, not within 2 m'],
    [{ object: 'desk', wall: 'south' }, 'FAILED: "desk" is 27.4 m from the south wall, not within 0.1 m'],
    [{ object: 'desk', centre: true }, 'FAILED: "desk" is 16.4 m from the middle of the room, not within 2 m'],
    [{ object: 'desk', near: 'plinth', within: 5 }, 'FAILED: "desk" is 12.4 m from "plinth", not within 5 m'],
    [{ object: 'bench', near: 'plinth', atLeast: 3 }, 'FAILED: "bench" is 1 m from "plinth", closer than 3 m'],
    [{ object: 'bench', side: 'north', of: 'plinth' }, 'FAILED: "bench" is south of "plinth", not north'],
    [{ object: 'left', side: 'right', of: 'middle' }, 'FAILED: "left" is west of "middle", and its right is east'],
    [{ object: 'desk', facing: 'east' }, 'FAILED: "desk" faces west, not east'],
    [{ object: 'desk', facing: 'left' }, 'FAILED: "desk" faces south, and "left" is west of it', { desk: { facing: 'south' } }],
    [{ object: 'door', click: 'door', goTo: 'hall' }, 'FAILED: a click on "door" of "door" goes to the whole-room view'],
    [{ object: 'door', click: 'door', opens: 'https://example.com' }, 'FAILED: a click on "door" of "door" goes to the whole-room view'],
    [{ object: 'bench', click: 'bench', action: 'togglePanel' }, 'FAILED: "bench" does nothing when "bench" is clicked (it has no actions)'],
    [{ stop: 'hall', sees: ['door'] }, 'FAILED: from stop "hall": "door" is not in the picture'],
    [{ stop: 'hall', sees: ['plinth', 'left'], share: 0.5 }, 'FAILED: from stop "hall": "plinth" fills 10% of the picture, less than 50%; "left" fills 0% of the picture, less than 50%'],
    [{ stop: 'hall', order: ['middle', 'left'] }, 'FAILED: from stop "hall", left to right they are: left, middle'],
    [{ stop: 'hall', order: ['left', 'door'] }, 'FAILED: from stop "hall": "door" is not in the picture'],
    // the middle frame hangs straight behind the plinth
    [{ stop: 'hall', sees: ['middle'], share: 0.001 }, 'FAILED: from stop "hall": "middle" is hidden behind plinth (hall:0)'],
    [{ count: 'pictureFrame', is: 2, wall: 'north' }, 'FAILED: there are 3 pictureFrame on the north wall, not 2'],
    [{ count: 'pedestal', is: 2, stop: 'hall' }, 'FAILED: there is 1 pedestal in stop "hall", not 2'],
    [{ room: { width: 24, height: 7 } }, 'FAILED: the room\'s width is 20 m and height is 8 m, not 24 and 7'],
    [{ stops: ['hall', 'wing'] }, 'FAILED: the tour is: hall'],
  ])('%j', async (e, message, over) => { expect(await check(e, over)).toEqual([message]); });

  it('a tall object in the way hides what is behind it; a low one the camera looks over does not', async () => {
    const tall = { desk: { type: 'wardrobe', at: undefined, position: [0, 0, 5], facing: 'north' } };
    expect(await check({ stop: 'hall', sees: ['plinth'] }, tall)).toEqual(['FAILED: from stop "hall": "plinth" is hidden behind desk (decor:0)']);
    expect(await check({ stop: 'hall', sees: ['plinth'] }, { desk: { at: undefined, position: [0, 0, 5], facing: 'north' } })).toEqual([]);
    // what is expected to be seen together does not count as hiding each other
    expect(await check({ stop: 'hall', sees: ['plinth', 'desk'] }, tall)).toEqual([]);
  });
});

describe('brief.json: what cannot be read is said to be invalid, with what to write', () => {
  it.each([
    ['desk in the corner', 'INVALID: an expectation is an object such as { "object": "desk", "wall": "north" }'],
    [{ wall: 'north' }, 'INVALID: say what it is about: one of "object", "count", "stop", "room", "stops"'],
    [{ object: 'desk' }, 'INVALID: say what is expected of "desk": one of "wall", "corner", "centre", "near", "side", "facing", "click"'],
    [{ object: 'desk', wall: 'north', corner: 'north-east' }, 'INVALID: say one thing of "desk": one of "wall", "corner", "centre", "near", "side", "facing", "click"'],
    [{ stop: 'hall' }, 'INVALID: say what is expected of "hall": one of "sees", "order"'],
    [{ object: 'desk', wall: 'north', withn: 1 }, 'INVALID: unknown key "withn": did you mean "within"? (known: object, wall, within)'],
    [{ object: 'desk', wall: 'north', within: 'close' }, 'INVALID: "within" has a value this form does not take; write it as { "object": X, "wall": "north", "within": 0.1 }'],
    [{ object: 'desk', side: 'left' }, 'INVALID: "of" is missing; write it as { "object": X, "side": "left", "of": Y }'],
    [{ object: 7, wall: 'north' }, 'INVALID: "object" must be the "name" of an object'],
    [{ object: 'table', wall: 'north' }, 'INVALID: no object is named "table" (named objects: desk, left, middle, door, bench, twin, plinth)'],
    [{ object: 'twin', wall: 'north' }, 'INVALID: "twin" names 2 objects; give them different names'],
    [{ object: 'desk', wall: 'up' }, 'INVALID: this room has no up wall (it has: north wall, east wall, south wall, west wall); give the edge index'],
    [{ object: 'desk', corner: 'north' }, 'INVALID: this room has no north corner (it has: north-west corner, north-east corner, south-east corner, south-west corner); give the vertex number'],
    [{ object: 'door', click: 'door' }, 'INVALID: say what the click does: one of "goTo", "opens", "action"'],
    [{ stop: 'wing', sees: ['desk'] }, 'INVALID: no stop has the id "wing" (stops: hall)'],
    [{ count: 'sofa', is: 1 }, 'INVALID: there is no object type "sofa" (types: pedestal, pictureFrame, wardrobe, cinemaScreen, desk, controlDesk, serverRack, door, bench, primitive)'],
    [{ count: 'desk' }, 'INVALID: say what is expected of the count: one of "is"'],
    [{ room: { length: 3 } }, 'INVALID: "room" has a value this form does not take; write it as { "room": { "width": 24, "depth": 24, "height": 7 } }'],
  ])('%j', async (e, message) => { expect(await check(e)).toEqual([message]); });

  it('the file itself: not JSON, not a brief, no text, an unknown key', async () => {
    const m = files();
    const { scene, pois } = await buildScene(opts(m));
    const of = raw => checkBrief(scene, pois, raw);
    expect(of(undefined)).toEqual({ findings: [], total: 0, held: 0, text: null });
    expect(of('{ nope').findings.map(f => f.message)).toEqual([expect.stringMatching(/^invalid JSON — /)]);
    expect(of('[]').findings.map(f => f.message)).toEqual(['a brief is { "text": "…", "expect": [ … ] }']);
    expect(of('{ "expects": [] }').findings.map(f => `${f.path}: ${f.message}`)).toEqual([
      ': unknown key "expects": did you mean "expect"? (known: text, expect)', 'text: give the description the scene was built from', 'expect: a list of expectations; see `node tools/scene.js keys brief`',
    ]);
    expect(of(briefFile('A hall.'))).toEqual({ findings: [], total: 0, held: 0, text: 'A hall.' });
  });
});

describe('the brief in the scene checks', () => {
  it('counts what holds, names the file and the entry, and says how to settle it', async () => {
    const m = files({ text: 'A desk by the south wall.', expect: [{ object: 'desk', facing: 'west' }, { object: 'desk', wall: 'south' }] });
    const r = await inspectFindings(await inspectScene(opts(m)), { files: m });
    expect(r.expectations).toEqual({ total: 2, held: 1 });
    expect(r.brief).toBe('A desk by the south wall.');
    expect(r.findings).toEqual([{
      level: 'error', code: 'EXPECT_FAILED', file: 's/brief.json', path: 'expect.1', message: '"desk" is 27.4 m from the south wall, not within 0.1 m',
      hint: 'the brief expects {"object":"desk","wall":"south"}; change the scene, or the expectation if the brief changed',
    }]);
  });

  it('is not evaluated on a scene with config errors, which would fail half of it', async () => {
    const m = files({ text: 'x', expect: [{ object: 'desk', wall: 'south' }] }, { desk: { at: { corner: 'up' } } });
    const r = await inspectFindings(await inspectScene(opts(m)), { files: m });
    expect(r.findings.map(f => f.code)).toEqual(['CONFIG', 'GEO_SKIPPED']);
    expect(r.expectations).toEqual({ total: 0, held: 0 });
  });

  it('every form documents itself', () => {
    for (const f of EXPECTATIONS) {
      expect(f.form, f.lead).toMatch(new RegExp(f.subject === f.lead ? `"${f.lead}": ` : `"${f.subject}": .*"${f.lead}": `));
      expect(f.says.length, f.lead).toBeGreaterThan(20);
      expect(() => JSON.parse(f.form.replace(/\b[XYZS]\b/g, '"x"'))).not.toThrow();
    }
  });
});
