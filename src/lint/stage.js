import * as React from 'react';
import * as THREE from 'three';
import { act, advance, createRoot, extend } from '@react-three/fiber';
import { ActionsContext, Segs, Solid, WorldContext } from '../scene/core.js';
import { createMaterials } from '../scene/materials/hatch.js';
import { SDK_BROWSER_KEYS, sdkCore } from '../prefabs/sdkCore.js';
import { screenSchema } from '../prefabs/screenSchema.js';
import { SCENE_DEFAULTS } from '../config/defaults.js';
import { withFootprint } from '../lib/footprint.js';

/**
 * A stage for one scene prefab, without a browser: its component is rendered by the real React and React Three
 * Fiber reconciler on a canvas that draws nothing, so what comes out is the three.js graph a page would get,
 * with real hooks, refs, effects and `useFrame`. The scene tools measure that graph (how big the prefab really
 * is, which parts it has, which hotspots it asks for, what moves) instead of trusting what its meta declares;
 * see src/lint/prefabRules.js and `node tools/scene.js prefab`.
 *
 * The SDK handed to the prefab is `sdkCore` plus stand-ins for what only a page has (`SDK_BROWSER_KEYS`): a screen
 * is a plain plane, a model or texture is empty and noted, and `reducedMotion` is whatever the stage was opened with.
 * `Solid` and `Segs` are the app's own, wrapped only to tag each object with what it was asked to be.
 *
 * No JSX here, and nothing that needs a DOM: this file runs in plain Node (the CLI) and in the test suite.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let extended = false;

const h = React.createElement;
const SCREEN_KEYS = new Set(Object.keys(screenSchema.shape));

/** Console lines that say nothing about the prefab: three.js and React talking about this stage itself. */
const NOISE = [/THREE\.Clock/, /not wrapped in act/, /The current testing environment is not configured/, /Multiple instances of Three/,
  // React repeats on the console what the boundary below has already caught
  /^Error: /, /The above error occurred/, /error boundary/i];

/** A console call as one line of text, its `%s` filled in the way the console would. */
function worded(first, ...rest) {
  const text = typeof first === 'string' ? first.replace(/%[sdo]/g, () => String(rest.shift() ?? '')) : String(first);
  return [text, ...rest.map(String)].join(' ').trim().split('\n')[0];
}

/** A canvas good enough for React Three Fiber to make a root on, and a renderer that draws nothing. */
function blank(width, height) {
  const canvas = { style: {}, width, height, clientWidth: width, clientHeight: height, ownerDocument: {}, addEventListener() {}, removeEventListener() {}, getContext: () => null, getBoundingClientRect: () => ({ left: 0, top: 0, width, height }) };
  const gl = { domElement: canvas, shadowMap: {}, info: {}, capabilities: {}, xr: { enabled: false, isPresenting: false, addEventListener() {}, removeEventListener() {}, setAnimationLoop() {} }, render() {}, setSize() {}, setPixelRatio() {}, getContext: () => ({}), dispose() {} };
  return { canvas, gl };
}

/** Keeps a prefab that throws while rendering from taking the stage down; `caught(error)` is told, a new `attempt` tries again. */
class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: null }; }
  static getDerivedStateFromError() { return {}; }
  componentDidCatch(error) { this.props.caught(error); this.setState({ failed: this.props.attempt }); }
  render() { return this.state.failed === this.props.attempt ? null : this.props.children; }
}

/** The corners of a geometry's points under a matrix, folded into `box`. */
function grow(box, attribute, matrix, v = new THREE.Vector3()) {
  for (let i = 0; i < attribute.count; i++) box.expandByPoint(v.fromBufferAttribute(attribute, i).applyMatrix4(matrix));
}

/** The box of one object's own geometry in the prefab's space; a fat line is read from its segments, not its quad. */
function ownBox(o, inverse) {
  const box = new THREE.Box3(), g = o.geometry;
  if (!g) return box;
  const m = new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld);
  if (g.attributes.instanceStart) { grow(box, g.attributes.instanceStart, m); grow(box, g.attributes.instanceEnd, m); } else if (g.attributes.position) grow(box, g.attributes.position, m);
  return box;
}

const isLine = o => o.isLine || o.isLineSegments2 || o.isLineSegments;
const flat = box => (box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() });

/**
 * Opens a stage for a registry entry of a scene prefab (`{ module, url, schema, … }`, see `loadPrefab` in
 * src/config/buildScene.js). `reducedMotion` is what the prefab's SDK will say. Resolves to the stage:
 *
 * - `render(props, { active, hovered })`  renders (or re-renders) the component; resolves to whether it rendered
 * - `frames(n, dt)`                       runs `n` frames of `dt` seconds through every `useFrame`
 * - `parts()`                             what the graph holds: `{ kind, name, shape, args, fill, line, hotspot, box, id }`
 *                                         with `kind` 'solid' | 'outline' | 'screen' | 'mesh' (the body) or 'lines'
 * - `measure()`                           `{ body, lines, all }`: boxes `{ min, max }` in the prefab's space, or null
 * - `snapshot()`                          every object's world matrix, to tell what a run of frames moved
 * - `asked`, `assets`, `notes`, `messages` the hotspot names it asked for, the files it named through `assetUrl`,
 *                                         what could not be staged, and what React said (each a Set or a list)
 * - `error`                               the last thing it threw, or null
 * - `close()`                             unmounts it
 *
 * Rejects only when the module's `component(sdk)` itself throws or returns no component.
 */
export async function openStage(entry, { reducedMotion = false, size = [1280, 720] } = {}) {
  if (!extended) { extend(THREE); extended = true; }
  const stage = { asked: new Set(), assets: new Set(), notes: new Set(), messages: [], error: null };
  const scene = { ...SCENE_DEFAULTS, room: withFootprint(SCENE_DEFAULTS.room) };
  const mats = createMaterials(scene);
  const world = { name: 'stage', mats, rain: { texture: new THREE.Texture(), canvas: null, step() {}, dispose() {} }, room: scene.room, theme: scene.theme };
  const own = new Set([...Object.values(mats.fills), ...Object.values(mats.lines)]);

  // what React and three.js say while the prefab renders is the prefab's business; the stage's own noise is not
  const said = text => { if (!NOISE.some(re => re.test(text)) && !stage.messages.includes(text)) stage.messages.push(text); };
  const listening = async work => {
    const { error, warn } = console;
    console.error = (...a) => said(worded(...a));
    console.warn = console.error;
    try { return await work(); } finally { console.error = error; console.warn = warn; }
  };

  // every name a part asks an action for, whether or not the scene binds one
  const actions = new Proxy({}, { get: (_, name) => { if (typeof name === 'string') stage.asked.add(name); return undefined; } });
  const tag = (props, part) => ({ ...props, userData: { ...props.userData, part } });
  const StageSolid = props => h(Solid, tag(props, { kind: 'solid', shape: props.shape ?? 'box', args: props.args ?? [1, 1, 1], fill: props.fill ?? 'main', line: props.line ?? 'thick', hotspot: props.hotspot ?? null }));
  const StageSegs = props => h(Segs, tag(props, { kind: 'lines', line: props.line ?? 'thin' }));
  function StageScreen({ w = 1, h: height = 1, ...props }) {
    const rest = {};
    for (const [k, v] of Object.entries(props)) if (!SCREEN_KEYS.has(k)) rest[k] = v;
    const bound = React.useContext(ActionsContext);
    if (props.id != null) void bound[props.id]; // a screen is a hotspot by its id
    return h('mesh', tag(rest, { kind: 'screen', id: props.id ?? null, source: props.source ?? 'rain' }), h('planeGeometry', { args: [w, height] }), h('meshBasicMaterial'));
  }
  const empty = what => { stage.notes.add(`${what} is not loaded here: its size is not measured, so check \`geometry\` by hand`); };
  const sdk = Object.freeze({
    ...sdkCore(entry.url),
    Solid: StageSolid,
    Segs: StageSegs,
    assetUrl: rel => { stage.assets.add(rel); return new URL(rel, entry.url).href; },
    ScreenSurface: StageScreen,
    reducedMotion,
    useLoader: () => { empty('a file fetched with useLoader'); return {}; },
    useGLTF: () => { empty('a glTF model'); return { scene: new THREE.Group(), nodes: {}, materials: {} }; },
    useModel: () => { empty('a glTF model'); return React.useMemo(() => new THREE.Group(), []); },
    useTexture: () => React.useMemo(() => new THREE.Texture(), []),
  });
  if (SDK_BROWSER_KEYS.some(k => !(k in sdk))) throw new Error('the stage SDK lacks a key of the browser SDK');

  const made = await listening(() => entry.module.component(sdk));
  if (typeof made !== 'function') throw new Error('component() did not return a component');

  const [width, height] = size, { canvas, gl } = blank(width, height);
  const root = await listening(async () => {
    const made = createRoot(canvas);
    await made.configure({ gl: () => gl, frameloop: 'never', size: { width, height, top: 0, left: 0 }, events: undefined });
    return made;
  });
  let store = null, attempt = 0, time = 0;
  const group = () => store.getState().scene.getObjectByName('__prefab');

  stage.sdk = sdk;
  stage.own = own;
  stage.render = async (props, { active = false, hovered = false } = {}) => {
    attempt++;
    stage.error = null;
    const tree = h(WorldContext.Provider, { value: world }, h(ActionsContext.Provider, { value: actions },
      h(Boundary, { attempt, caught: error => { stage.error = error; } },
        h(React.Suspense, { fallback: null }, h('group', { name: '__prefab' }, h(made, { props, active, hovered }))))));
    try { await listening(() => act(async () => { store = root.render(tree); })); } catch (error) { stage.error = error; }
    return !stage.error && !!group();
  };
  stage.frames = async (n, dt = 1 / 60) => {
    try { await listening(() => act(async () => { for (let i = 0; i < n; i++) advance((time += dt), true, store.getState()); })); } catch (error) { stage.error = error; return false; }
    return true;
  };
  stage.parts = () => {
    const top = group();
    if (!top) return [];
    top.updateWorldMatrix(true, true);
    const inverse = top.matrixWorld.clone().invert(), out = [];
    top.traverse(o => {
      const part = o.userData?.part;
      // the outline a solid draws around itself belongs to the solid
      if (isLine(o) && o.parent?.userData?.part?.kind === 'solid') return;
      let kind, box;
      if (part?.kind === 'solid') {
        // filled, it is its mesh; outline only, it is the edges it draws
        box = o.isMesh ? ownBox(o, inverse) : o.children.filter(isLine).reduce((b, l) => b.union(ownBox(l, inverse)), new THREE.Box3());
        kind = o.isMesh ? 'solid' : 'outline';
      } else if (part?.kind === 'screen') { kind = 'screen'; box = ownBox(o, inverse); }
      else if (isLine(o)) { kind = 'lines'; box = ownBox(o, inverse); }
      else if (o.isMesh || o.isPoints) { kind = 'mesh'; box = ownBox(o, inverse); }
      else return;
      const material = isLine(o) || o.isMesh || o.isPoints ? o.material : null;
      out.push({
        kind, name: o.name || null, box: flat(box), object: o,
        shape: part?.shape ?? null, args: part?.args ?? null, fill: part?.fill ?? null, line: part?.line ?? null, hotspot: part?.hotspot ?? null, id: part?.id ?? null,
        // a screen draws its own picture; anything else should wear the room's materials
        foreign: kind !== 'screen' && material != null && ![material].flat().every(m => own.has(m)),
      });
    });
    return out;
  };
  stage.measure = () => {
    const body = new THREE.Box3(), lines = new THREE.Box3();
    for (const p of stage.parts()) if (p.box) (p.kind === 'lines' ? lines : body).union(new THREE.Box3(new THREE.Vector3(...p.box.min), new THREE.Vector3(...p.box.max)));
    return { body: flat(body), lines: flat(lines), all: flat(body.clone().union(lines)) };
  };
  /** The edges a drawing would show, per part and in the prefab's space: `[{ part, segments }]`, `segments` a flat list of x, y, z pairs of points. */
  stage.edges = () => {
    const top = group();
    if (!top) return [];
    const inverse = top.matrixWorld.clone().invert(), v = new THREE.Vector3();
    return stage.parts().map((part, index) => {
      const segments = [];
      const take = (o, attribute, other) => {
        const m = new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld);
        for (let i = 0; i < attribute.count; i++) {
          segments.push(...v.fromBufferAttribute(attribute, i).applyMatrix4(m).toArray());
          if (other) segments.push(...v.fromBufferAttribute(other, i).applyMatrix4(m).toArray());
        }
      };
      const lines = o => (o.geometry.attributes.instanceStart ? take(o, o.geometry.attributes.instanceStart, o.geometry.attributes.instanceEnd) : take(o, o.geometry.attributes.position));
      const o = part.object;
      if (isLine(o)) lines(o);
      else if (o.isMesh) { const e = new THREE.EdgesGeometry(o.geometry, 20); take(o, e.attributes.position); e.dispose(); }
      else o.children.filter(isLine).forEach(lines);
      return { part, index, segments };
    });
  };
  stage.snapshot = () => {
    const top = group(), out = new Map();
    if (!top) return out;
    top.updateWorldMatrix(true, true);
    top.traverse(o => out.set(o.uuid, o.matrixWorld.toArray()));
    return out;
  };
  stage.close = async () => {
    try { await listening(() => act(async () => { root.unmount(); })); } catch { /* a prefab that throws on the way out has said so already */ }
    mats.dispose();
  };
  return stage;
}

/** The parts whose place changed between two snapshots (see `stage.snapshot`), as the names or shapes of what moved. */
export function moved(before, after, parts, tolerance = 1e-5) {
  const changed = o => { const a = before.get(o.uuid), b = after.get(o.uuid); return !a || !b || a.some((v, i) => Math.abs(v - b[i]) > tolerance); };
  return parts.filter(p => changed(p.object));
}
