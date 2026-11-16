import { access, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, posix, relative, sep } from 'node:path';
import { checkPrefabs, checkScene, loadScene, ownPrefabs, sceneNames, SCENES } from './load.js';
import { newSceneFiles } from '../../src/editor/bundle.js';
import { setAt } from '../../src/editor/jsonEdit.js';
import { SCENE_NAME } from '../../src/config/loadScene.js';
import { describePrefabs, describeScene } from '../../src/lint/describe.js';
import { planSvg, planText } from '../../src/lint/plan.js';
import { BUILTIN, BUILTIN_REGISTRY, TYPE_NAME } from '../../src/prefabs/registry.js';
import { formatFinding } from '../../src/lint/rules.js';
import { keysText, SECTIONS } from '../../src/lint/keys.js';
import { briefFile } from '../../src/lint/expect.js';
import { describePrefab, MOUNT_NAMES, prefabTemplate } from '../../src/lint/prefabDescribe.js';
import { catalogFile, showroomFiles } from '../../src/lint/showroom.js';

/**
 * What the scene tools do, as functions: each takes named arguments and resolves to `{ lines, code?, … }`, the
 * text to show (one string per line) and, where it matters, whether it passed (`code` 0 or 1). Nothing here prints
 * or exits, so the command line (tools/scene.js) and the MCP server (tools/mcp.js) are two thin fronts over the
 * same behaviour. A request that makes no sense (an unknown scene, a bad name) throws `UsageError`.
 */

export class UsageError extends Error {}
const fail = message => { throw new UsageError(message); };
const there = file => access(file).then(() => true, () => false);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The scene folders, after making sure `scene` is one of them. */
async function known(scene) {
  const { dirs } = await sceneNames();
  if (!dirs.includes(scene)) fail(`no scene folder "${scene}" in public/scenes (there are: ${dirs.join(', ')})`);
  return dirs;
}

/** One scene that builds, for the commands that need positions. */
async function built(scene) {
  await known(scene);
  const loaded = await loadScene(scene);
  if (!loaded.scene || loaded.errors.length) fail(`${scene} has config errors; run: node tools/scene.js check ${scene}`);
  return loaded;
}

/** Every problem in the named scenes (all of them when none is named): `{ lines, code, findings }`. */
export async function check({ scenes = [], strict = false } = {}) {
  const { dirs } = await sceneNames();
  const unknown = scenes.find(n => !dirs.includes(n));
  if (unknown) fail(`no scene folder "${unknown}" in public/scenes (there are: ${dirs.join(', ')})`);
  const lines = [], all = [];
  let bad = false;
  for (const name of scenes.length ? scenes : dirs) {
    const { findings, expectations: { total, held } } = await checkScene(name);
    all.push(...findings.map(f => ({ scene: name, ...f })));
    const count = level => findings.filter(f => f.level === level).length;
    if (count('error') || (strict && count('warn'))) bad = true;
    lines.push(...findings.map(formatFinding));
    // what the brief expects, when the scene has one: all of it holding is part of "ok"
    const brief = total ? (held === total ? `, ${plural(total, 'expectation')} hold` : `, ${held} of ${total} expectations hold`) : '';
    lines.push(`${name}: ${findings.length ? `${count('error')} errors, ${count('warn')} warnings, ${count('info')} notes` : 'ok'}${brief}`);
  }
  return { lines, code: bad ? 1 : 0, findings: all };
}

/** The scene in words, opening with the brief it was built from when it has one. */
export async function describe({ scene }) {
  const { scene: s, pois, files } = await built(scene);
  let brief = null;
  try { brief = JSON.parse(files.get('brief.json') ?? 'null')?.text; } catch { /* `check` reports a brief that does not parse */ }
  return { lines: describeScene(s, pois, { brief: typeof brief === 'string' ? brief : null }) };
}

/** The floor plan as text; with `svg`, as an SVG document in `svg` instead. */
export async function plan({ scene, svg = false }) {
  const { scene: s, pois } = await built(scene);
  return svg ? { lines: [], svg: planSvg(s, pois) } : { lines: planText(s, pois) };
}

/** The object types that can be placed: the built-in ones, with a scene also its own. */
export async function prefabs({ scene = null } = {}) {
  return { lines: describePrefabs(scene ? (await built(scene)).scene.registry : BUILTIN_REGISTRY) };
}

/** Every key of a scene's files, a section at a time; the list of sections when none is named. */
export function keys({ section = null } = {}) {
  if (section && !Object.hasOwn(SECTIONS, section)) fail(`no section "${section}" (there are: ${Object.keys(SECTIONS).join(', ')})`);
  return { lines: keysText(section) };
}

/** A new scene folder with a room and one stop, listed in scenes/index.json; `brief` also starts its brief.json. */
export async function newScene({ name, title = null, brief = null }) {
  if (!SCENE_NAME.test(name ?? '')) fail(`"${name}" is not a scene name: use letters, digits, "-" and "_"`);
  const dir = join(SCENES, name);
  if (await there(dir)) fail(`public/scenes/${name} already exists`);
  const heading = title ?? name.replace(/[-_]+/g, ' ').replace(/^./, c => c.toUpperCase());
  for (const [path, text] of [...newSceneFiles(heading), ...(brief ? [['brief.json', briefFile(brief)]] : [])]) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), text.endsWith('\n') ? text : `${text}\n`);
  }
  const indexFile = join(SCENES, 'index.json');
  const text = await readFile(indexFile, 'utf8');
  const listed = JSON.parse(text).scenes ?? [];
  if (!listed.includes(name)) await writeFile(indexFile, setAt(text, ['scenes'], [...listed, name])); // keeps the file's layout
  return { lines: [
    `created public/scenes/${name} (scene.json, poi/start.json, content/start.md${brief ? ', brief.json' : ''}) and listed it in scenes/index.json`,
    brief ? `next: write what the brief expects into brief.json › expect (node tools/scene.js keys brief), edit the files, then run: node tools/scene.js check ${name}`
      : `next: edit the files, then run: node tools/scene.js check ${name}`,
  ] };
}

/** A scene with its own types, after making sure `type` (when named) is one of them: `{ loaded, own, known }`. */
async function withTypes(scene, type = null) {
  await known(scene);
  const loaded = await loadScene(scene), own = ownPrefabs(loaded), names = own.map(o => o.type);
  if (type && !names.includes(type)) {
    const broken = loaded.errors.filter(l => l.includes(` › prefabs.${type}:`));
    fail(broken.length ? broken.join('\n') : `${scene} has no type "${type}" of its own (${names.length ? `it has: ${names.join(', ')}` : 'it declares none in scene.json › prefabs'})`);
  }
  return { loaded, own, names };
}

/** A new object type of the scene's own: `prefabs/<type>.js` from a template, declared in scene.json. */
export async function prefabNew({ scene, type, mount = 'floor', title = undefined }) {
  await known(scene);
  const loaded = await loadScene(scene), path = `prefabs/${type}.js`, file = join(SCENES, scene, path);
  if (!TYPE_NAME.test(type ?? '')) fail(`"${type}" is not a type name: letters, digits and "_", starting with a lowercase letter`);
  if (Object.hasOwn(BUILTIN, type)) fail(`"${type}" is a built-in type; pick another name`);
  if (!MOUNT_NAMES.includes(mount)) fail(`--mount is one of: ${MOUNT_NAMES.join(', ')}`);
  let decl;
  try { decl = JSON.parse(loaded.files.get('scene.json')); } catch { fail(`${scene}/scene.json is not valid JSON; fix it first`); }
  if (decl.prefabs?.[type] != null) fail(`${scene} already declares "${type}" (${decl.prefabs[type]})`);
  if (await there(file)) fail(`public/scenes/${scene}/${path} already exists`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, prefabTemplate(type, { mount, title: title ?? undefined, scene }));
  await writeFile(join(SCENES, scene, 'scene.json'), setAt(loaded.files.get('scene.json'), ['prefabs', type], path));
  return { lines: [
    `created public/scenes/${scene}/${path} (a ${mount} object, one box) and declared it in scene.json › prefabs`,
    `next: give it its parts, then run: node tools/scene.js prefab check ${scene} ${type}`,
    'a type that is declared must also be placed somewhere in the scene, or the test suite fails',
  ] };
}

/** What is wrong with the scene's own types (one, when `type` is named), each rendered without a browser. */
export async function prefabCheck({ scene, type = null, strict = false }) {
  const { loaded, names } = await withTypes(scene, type);
  const loadErrors = loaded.errors.filter(l => l.includes(' › prefabs.'));
  const findings = await checkPrefabs(loaded, { exists: p => there(join(loaded.dir, p)), only: type });
  const count = level => findings.filter(f => f.level === level).length + (level === 'error' ? loadErrors.length : 0);
  return {
    lines: [
      ...loadErrors.map(l => `error CONFIG  ${l}`), ...findings.map(formatFinding),
      `${scene} › ${type ?? plural(names.length, 'type')}: ${findings.length || loadErrors.length ? `${count('error')} errors, ${count('warn')} warnings, ${count('info')} notes` : 'ok'}`,
    ],
    code: count('error') || (strict && count('warn')) ? 1 : 0, findings,
  };
}

/** One of the scene's own types read back: parts, sizes, outline; `props` (an object) describes it with other props. `svg` is the drawing. */
export async function prefabDescribe({ scene, type, props = null }) {
  const { own } = await withTypes(scene, type);
  const entry = own.find(o => o.type === type).entry;
  let parsed = entry.props;
  if (props != null) {
    const r = entry.schema.safeParse(props);
    if (!r.success) fail(r.error.issues.map(i => `props${i.path.length ? `.${i.path.join('.')}` : ''}: ${i.message}`).join('\n'));
    parsed = r.data;
  }
  return describePrefab(type, entry, { props: parsed });
}

/** Writes `prefabs/catalog.json`, the list the editor offers the scene's own types from. */
export async function prefabCatalog({ scene }) {
  const { loaded, own, names } = await withTypes(scene);
  if (!own.length) fail(`${scene} has no object types of its own to list (it declares none in scene.json › prefabs)`);
  let title = scene;
  try { title = JSON.parse(loaded.files.get('scene.json')).title ?? scene; } catch { /* the folder's name will do */ }
  await mkdir(join(loaded.dir, 'prefabs'), { recursive: true });
  await writeFile(join(loaded.dir, 'prefabs', 'catalog.json'), catalogFile({ own, previous: loaded.files.get('prefabs/catalog.json'), title: `${title} objects` }));
  return { lines: [`wrote public/scenes/${scene}/prefabs/catalog.json: ${names.join(', ')}`] };
}

/** Lays the scene out as a gallery of its own types: a stop, a camera and a page for each, and the catalog. */
export async function showroom({ scene }) {
  const { loaded, own } = await withTypes(scene);
  const broken = loaded.errors.filter(l => l.includes(' › prefabs.'));
  if (broken.length) fail(`${broken.join('\n')}\nfix the types first: node tools/scene.js prefab check ${scene}`);
  let made;
  try { made = showroomFiles({ name: scene, files: loaded.files, own }); } catch (e) { fail(e.message); }
  for (const [path, text] of made.files) {
    await mkdir(dirname(join(loaded.dir, path)), { recursive: true });
    await writeFile(join(loaded.dir, path), text);
  }
  for (const path of made.removed) await rm(join(loaded.dir, path), { force: true });
  return { lines: [...made.summary, `next: node tools/scene.js check ${scene} --strict`] };
}

/** Pictures of the scene from the real viewer, on one sheet: `{ lines, code, file }`. Needs Playwright's Chromium. */
export async function shots({ scene, views = null, size = [640, 360], out = undefined, measure = false }) {
  await known(scene);
  if (size.length !== 2 || !size.every(v => Number.isInteger(v) && v >= 160 && v <= 2560)) fail('--size is WIDTHxHEIGHT in pixels, such as --size=640x360');
  const { takeShots } = await import('./shots.js');
  let r;
  try { r = await takeShots(scene, { views, size, measure, ...(out ? { out } : {}) }); } catch (e) { return { lines: [e.message], code: 1, file: null }; }
  return {
    lines: [
      `${scene}: ${plural(r.frames.length, 'picture')} (${r.frames.map(f => f.view).join(', ')}) on one sheet, ${r.width} × ${r.height} px, in ${(r.ms / 1000).toFixed(1)} s`,
      r.file, ...r.notes, ...r.errors.map(line => `error in the page: ${line}`),
      'look at the picture: each frame is labelled; the panel, markers\' labels and dust are left out, and a stop\'s objects are shown as when nobody is at it',
    ],
    code: r.errors.length ? 1 : 0, file: r.file,
  };
}

// ── a scene's files, for a client that has no file system of its own ─────────────────────────────

/** The kinds of file a scene's text is in; pictures, video and models are put in the folder by other means. */
const TEXT = /\.(json|md|js|svg|txt|csv)$/i;
const MAX_TEXT = 512 * 1024;

/** A path inside a scene folder, checked: `{ file, path }`, the place on disk and the path as the scene knows it. */
function inside(scene, path) {
  if (typeof path !== 'string' || !path.trim()) fail('name the file, relative to the scene folder: poi/desk.json');
  const clean = posix.normalize(path.trim().replace(/\\/g, '/'));
  if (clean.startsWith('/') || clean.split('/').includes('..') || clean === '.') fail(`"${path}" is not a path inside the scene folder`);
  const file = join(SCENES, scene, ...clean.split('/'));
  if (!file.startsWith(join(SCENES, scene) + sep)) fail(`"${path}" is not a path inside the scene folder`);
  return { file, path: clean };
}

/** Every scene with its title and stops, the default one marked. */
export async function listScenes() {
  const { dirs, listed } = await sceneNames();
  let first = null;
  try { first = JSON.parse(await readFile(join(SCENES, 'index.json'), 'utf8')).default; } catch { /* no index */ }
  const scenes = [];
  for (const name of dirs) {
    let title = null, stops = null;
    try { const s = JSON.parse(await readFile(join(SCENES, name, 'scene.json'), 'utf8')); title = s.title ?? null; stops = Array.isArray(s.poi) ? s.poi.length : 0; } catch { /* `check` says what is wrong with it */ }
    scenes.push({ name, title, stops, default: name === first, listed: listed ? listed.includes(name) : true });
  }
  return { lines: scenes.length ? scenes.map(s => `${s.name}${s.default ? ' (the default)' : ''}: ${s.title ? `"${s.title}"` : 'scene.json cannot be read'}${s.stops == null ? '' : `, ${plural(s.stops, 'stop')}`}${s.listed ? '' : ' (not in scenes/index.json)'}`) : ['no scenes yet'], scenes };
}

/** A scene's files with their sizes when no `path` is given; with one, that file's text. */
export async function readScene({ scene, path = null }) {
  await known(scene);
  const root = join(SCENES, scene);
  if (path == null) {
    const lines = [];
    const walk = async dir => {
      for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const full = join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (e.name !== '.DS_Store') lines.push(`${relative(root, full).split(sep).join('/')}  ${(await stat(full)).size} bytes`);
      }
    };
    await walk(root);
    return { lines: [`public/scenes/${scene}: ${plural(lines.length, 'file')}`, ...lines] };
  }
  const at = inside(scene, path);
  if (!(await there(at.file))) fail(`public/scenes/${scene}/${at.path} does not exist`);
  if (!TEXT.test(at.path)) fail(`${at.path} is not a text file; only .json, .md, .js, .svg, .txt and .csv are read as text`);
  if ((await stat(at.file)).size > MAX_TEXT) fail(`${at.path} is larger than ${MAX_TEXT / 1024} kB`);
  return { lines: (await readFile(at.file, 'utf8')).split('\n'), path: at.path };
}

/** Writes one text file into a scene folder, then says what the scene's check makes of it. */
export async function writeScene({ scene, path, text }) {
  await known(scene);
  const at = inside(scene, path);
  if (!TEXT.test(at.path)) fail(`${at.path}: only .json, .md, .js, .svg, .txt and .csv files can be written; put pictures, video and models into the folder by hand`);
  if (typeof text !== 'string') fail('give the file\'s whole text');
  if (Buffer.byteLength(text) > MAX_TEXT) fail(`the text is larger than ${MAX_TEXT / 1024} kB`);
  const was = await there(at.file);
  await mkdir(dirname(at.file), { recursive: true });
  await writeFile(at.file, text.endsWith('\n') ? text : `${text}\n`);
  const result = await check({ scenes: [scene], strict: true });
  return { lines: [`${was ? 'replaced' : 'created'} public/scenes/${scene}/${at.path}`, ...result.lines], code: result.code };
}

/** Removes one file from a scene folder (never scene.json), then says what the scene's check makes of it. */
export async function removeScene({ scene, path }) {
  await known(scene);
  const at = inside(scene, path);
  if (at.path === 'scene.json') fail('scene.json is the scene: it is not removed');
  if (!(await there(at.file)) || !(await stat(at.file)).isFile()) fail(`public/scenes/${scene}/${at.path} is not a file`);
  await rm(at.file);
  const result = await check({ scenes: [scene], strict: true });
  return { lines: [`removed public/scenes/${scene}/${at.path}`, ...result.lines], code: result.code };
}
