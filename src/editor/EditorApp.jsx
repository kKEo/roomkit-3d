import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Viewer } from '../App.jsx';
import { useStore, runtime } from '../state/store.js';
import { buildScene, readerFromMap } from '../config/buildScene.js';
import { scenesBase, sceneNameFromUrl, importModule, loadIndex, SCENE_NAME } from '../config/loadScene.js';
import { ConfigError } from '../config/schema.js';
import { applyTheme } from '../ui/theme.js';
import { BUILTIN_REGISTRY } from '../prefabs/registry.js';
import { preloadPrefabs } from '../prefabs/preload.js';
import { autoPlacement } from '../lib/autoCamera.js';
import { fetchBundle, fetchBytes, newSceneFiles, objectTemplate, slug } from './bundle.js';
import { exportOptions, withExportOptions, sceneRefs, hostedModules, bundleEntries, folderEntries, importZip, mimeOf, cleanPath } from './export.js';
import { readZip } from './unzip.js';
import { makeZip } from './zip.js';
import {
  DECOR, sceneTree, errorsByKey, parseKey, objectKey, stopKey, addToScenery, moveObject, makeStop, dissolveStop, deleteStop,
  deleteObject, duplicateObject, moveStop, renameObject, renameNewStop, setField, setObjectField, stopRefs, viewSpot,
  prefabDecls, addPrefabDecls, removePrefabDecl,
} from './tree.js';
import { Tree } from './Tree.jsx';
import { Inspector } from './Inspector.jsx';
import { AddMenu } from './AddMenu.jsx';
import { AddTypeDialog } from './AddTypeDialog.jsx';
import { ContextMenu, ConfirmBox } from './Menus.jsx';

const sortPaths = paths => [...paths].sort((a, b) => (a === 'scene.json' ? -1 : b === 'scene.json' ? 1 : a.localeCompare(b)));

// where the viewer's files come from for "Whole site": the dev server builds them on demand, a build ships viewer.json
const VIEWER_BASE = import.meta.env.DEV ? '/__viewer/' : import.meta.env.BASE_URL;
// a viewer built to read scenes from another host would not find the scene inside the zip
const REMOTE_SCENES = !!import.meta.env.VITE_SCENES_BASE;

const round = v => Math.round(v * 100) / 100;
const fmtPose = p => `${p.position.map(round).join(', ')} looking at ${p.target.map(round).join(', ')}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const currentPose = () => ({ position: runtime.pose.position.map(round), target: runtime.pose.target.map(round) });

function download(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/zip' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** A file held in memory (imported): its bytes and an object URL the preview can load it from. */
const held = (path, bytes) => ({ bytes, url: URL.createObjectURL(new Blob([bytes], { type: mimeOf(path) })) });

/** Fly the preview to a tree node: a stop's own view, an object as a stop of it would see it, the room from above. */
function frame(key) {
  const st = useStore.getState();
  const k = parseKey(key);
  if (k.stop) { const p = st.pois.find(x => x.file === k.stop); if (p) st.goTo(p.id); return; }
  if (k.owner == null) { st.goTo(null); return; }
  const obj = k.owner === DECOR ? st.scene?.decor[k.index] : st.pois.find(p => p.file === k.owner)?.objects[k.index];
  const entry = obj && st.scene.registry.get(obj.type);
  if (entry) st.openAt(autoPlacement(obj, entry.placement(obj.props)).camera);
}

/** Key changes when an object leaves `owner` at `index` (the later ones move up), or arrives there (the later ones move down). */
const afterRemove = (owner, index) => k => {
  const p = parseKey(k);
  if (p.owner !== owner) return k;
  return p.index < index ? k : p.index === index ? null : objectKey(owner, p.index - 1);
};
const afterInsert = (owner, index) => k => {
  const p = parseKey(k);
  return p.owner === owner && p.index >= index ? objectKey(owner, p.index + 1) : k;
};

/**
 * The editor: the scene on the left, the live room on the right. **Objects** shows the scene as a tree (the room,
 * the scenery, the stops with their objects) with an inspector for the selected node; **Files** shows the text files
 * themselves. Both edit the same files, and every edit is rebuilt with the same `buildScene` the viewer uses, so the
 * preview is the published result and the error lines are the ones the loading screen would show. Everything new
 * starts as scenery and becomes a stop (or goes back) through **Belongs to**, dragging, or the right-click menu.
 * "Import…" takes a zip or loose media files; "Export…" gives the scene folder or a whole site.
 */
export function EditorApp() {
  const [name, setName] = useState(() => sceneNameFromUrl() || 'my-room');
  const [files, setFiles] = useState(null);
  // the latest files for handlers that run after a render (toast buttons, confirmations), and the undo history
  const latest = useRef(null);
  latest.current = files;
  const hist = useRef({ past: [], future: [], typingAt: 0 });
  // files that are not text the editor shows (media, modules, data), kept in memory after an import: path → { bytes, url }
  const [assets, setAssets] = useState(() => new Map());
  const [sel, setSel] = useState('scene.json');
  const [view, setView] = useState('objects'); // objects | files
  const [errors, setErrors] = useState([]);
  const [status, setStatus] = useState('Loading…');
  const [expanded, setExpanded] = useState(() => new Set(['scenery', 'stops']));
  const [filter, setFilter] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [menu, setMenu] = useState(null); // { x, y, items }
  const [ask, setAsk] = useState(null); // { title, lines, actions }
  const [toast, setToast] = useState(null); // { text, kind, actions }
  const [adding, setAdding] = useState(false);
  const [addingType, setAddingType] = useState(false);
  // open the Add palette once the build after "Add type" has made the new types known
  const openPalette = useRef(false);
  // the prefab types the last good build knew: built-ins plus the scene's own
  const registry = useStore(s => s.scene?.registry) ?? BUILTIN_REGISTRY;
  const hasTransforms = useStore(s => Object.keys(s.scene?.transforms ?? {}).length > 0);
  const pois = useStore(s => s.pois);
  const current = useStore(s => s.current);
  const edit = useStore(s => s.edit);
  // bumped by "Reload modules": the scene's prefab and transform modules are re-imported under a new `?v=`
  const [bust, setBust] = useState(0);
  // the Export section: open, what it is doing, and the referenced files nothing could supply
  const [exporting, setExporting] = useState(false);
  const [note, setNote] = useState(null);
  const [missing, setMissing] = useState(() => new Set());
  // media paths resolve against the scene the editor started from (new scenes have no media yet)
  const base = useRef(null);
  const built = useRef(false);
  const picker = useRef(null);
  // the stop makeStop just made, whose first name also renames its id and files
  const fresh = useRef(null);

  // the editor's hold on the preview: selection, hover, hidden and locked objects, Preview / Select mode
  useEffect(() => {
    useStore.setState({
      edit: {
        mode: 'preview', tool: 'move', selected: null, part: null, hovered: null, hidden: new Set(), locked: new Set(), frame,
        transform: (key, value) => keys.current.transform(key, value),
      },
    });
    return () => useStore.setState({ edit: null });
  }, []);

  useEffect(() => {
    const n = sceneNameFromUrl();
    // the index first: it names the code origins the operator allows, which the first build already needs
    const ready = loadIndex().catch(() => null);
    if (!n) { ready.then(() => setFiles(newSceneFiles())); return; }
    const b = new URL(`${n}/`, scenesBase());
    base.current = b;
    ready.then(() => fetchBundle(b)).then(setFiles).catch(e => { setErrors([String(e.message)]); setFiles(newSceneFiles()); });
  }, []);

  // how the preview (and the "Add type" check) finds files and imports modules:
  // a file held in memory wins over the published folder; modules are re-imported under a new `?v=` on Reload
  const resolveUrl = useCallback(p => assets.get(cleanPath(p))?.url ?? (base.current ? new URL(p, base.current).href : p), [assets]);
  const loadModule = useCallback(url => importModule(url.startsWith('blob:') ? url : `${url}${url.includes('?') ? '&' : '?'}v=${bust}`), [bust]);

  // rebuild the scene a moment after the last change
  useEffect(() => {
    if (!files) return;
    const t = setTimeout(async () => {
      try {
        const { scene, pois } = await preloadPrefabs(await buildScene({ name, read: readerFromMap(files), resolveUrl, loadModule }));
        applyTheme(scene);
        useStore.getState().setLoaded(scene, pois);
        built.current = true;
        setErrors([]);
        if (openPalette.current) { openPalette.current = false; setAdding(true); }
        setStatus(`${plural(pois.length, 'stop')} · ${plural(scene.decor.length, 'scenery object')} · ${plural(files.size, 'file')}${assets.size ? ` · ${plural(assets.size, 'file')} in memory` : ''}`);
      } catch (e) {
        const lines = e instanceof ConfigError ? e.lines : [String(e.message ?? e)];
        setErrors(lines);
        if (!built.current) useStore.getState().setError(e instanceof ConfigError ? e : new ConfigError(lines));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [files, name, assets, resolveUrl, loadModule]);

  useEffect(() => {
    if (!toast) return;
    // one with buttons (Undo, Make it a stop) stays long enough to reach them
    const t = setTimeout(() => setToast(null), toast.actions.length ? 20000 : toast.kind === 'bad' ? 9000 : 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const tree = useMemo(() => (files ? sceneTree(files) : { ok: true, title: null, decor: [], stops: [] }), [files]);
  const errorMap = useMemo(() => errorsByKey(errors, name, tree), [errors, name, tree]);
  // what went wrong with each of the scene's own types (`scene.json › prefabs.<type>: …`), for the Room's type list
  const typeErrors = useMemo(() => new Map(errors.map(l => /› prefabs\.([A-Za-z0-9_]+): ([\s\S]*)$/.exec(l)).filter(Boolean).map(m => [m[1], m[2]])), [errors]);
  const hosted = useMemo(() => (files ? hostedModules(files) : []), [files]);
  const badFiles = useMemo(() => new Set(errors.map(l => l.split(/ › |: /)[0].replace(`${name}/`, ''))), [errors, name]);
  const paths = useMemo(() => (files ? sortPaths(files.keys()) : []), [files]);
  const safe = SCENE_NAME.test(name) ? name : slug(name);
  const selected = edit?.selected ?? null;

  // the selected node's branch opens, wherever it was selected from (the room, an operation)
  useEffect(() => {
    if (!selected) return;
    const k = parseKey(selected);
    const need = k.owner === DECOR ? ['scenery'] : k.owner ? ['stops', stopKey(k.owner)] : k.stop ? ['stops'] : [];
    setExpanded(prev => (need.every(n => prev.has(n)) ? prev : new Set([...prev, ...need])));
  }, [selected]);

  // publishing options and referenced files, read from the files themselves
  const opts = useMemo(() => (files ? exportOptions(files) : { freeFly: true, start: null }), [files]);
  const refs = useMemo(() => (files ? sceneRefs(files, registry) : []), [files, registry]);
  // what the zip will hold besides the text files: the referenced files, plus anything imported that they don't name
  const extra = useMemo(() => [...new Set([...refs, ...assets.keys()])].filter(p => !files?.has(p)).sort(), [refs, assets, files]);
  const pose = opts.start && typeof opts.start === 'object' ? opts.start : null;
  const startValue = opts.start == null ? '' : pose ? 'pose' : `poi:${opts.start}`;

  const say = (text, kind = 'ok', actions = []) => setToast({ text, kind, actions });
  const select = key => useStore.getState().setEdit({ selected: key });

  /** New files with an undo step; quick successive typing is one step. */
  const commit = (next, { typing = false } = {}) => {
    const h = hist.current, now = Date.now();
    if (!(typing && now - h.typingAt < 1500)) { h.past.push(latest.current); if (h.past.length > 200) h.past.shift(); }
    h.typingAt = typing ? now : 0;
    h.future = [];
    latest.current = next;
    setFiles(next);
  };
  const undo = () => {
    const h = hist.current;
    if (!h.past.length) return;
    h.future.push(latest.current);
    latest.current = h.past.pop();
    h.typingAt = 0;
    setFiles(latest.current);
  };
  const redo = () => {
    const h = hist.current;
    if (!h.future.length) return;
    h.past.push(latest.current);
    latest.current = h.future.pop();
    setFiles(latest.current);
  };

  /** Runs a change of the files: `fn(files)` gives new files, or `{ files, key }` and that node is selected. */
  const change = (fn, how) => {
    try {
      const r = fn(latest.current);
      const next = r instanceof Map ? r : r.files;
      if (next !== latest.current) {
        commit(next, how);
        if (how?.note) say(how.note);
      }
      if (!(r instanceof Map) && r.key) select(r.key);
      how?.then?.();
      return r;
    } catch (e) {
      say(`Could not do that: ${e.message}`, 'bad');
      return null;
    }
  };
  /** Carries the editor-only marks (hidden, locked) over a change that moves objects up or down their lists. */
  const remark = (...maps) => {
    const ed = useStore.getState().edit;
    const map = set => new Set([...set].map(k => maps.reduce((x, m) => (x == null ? x : m(x)), k)).filter(Boolean));
    useStore.getState().setEdit({ hidden: map(ed.hidden), locked: map(ed.locked), hovered: null });
  };

  const ownerName = owner => (owner === DECOR ? 'the scenery' : `“${tree.stops.find(s => s.file === owner)?.label ?? owner}”`);
  const nodeOf = key => {
    const t = sceneTree(latest.current), k = parseKey(key);
    return (k.owner === DECOR ? t.decor : t.stops.find(s => s.file === k.owner)?.objects)?.[k.index];
  };

  // ── operations ──────────────────────────────────────────────────────────────

  const moveTo = (key, owner, index = -1) => {
    const src = parseKey(key);
    const r = change(f => moveObject(f, key, owner, index));
    if (!r) return;
    const moved = parseKey(r.key);
    remark(k => (k === key ? `\0${r.key}` : k), afterRemove(src.owner, src.index), afterInsert(owner, moved.index), k => k.replace('\0', ''));
    say(src.owner === owner ? 'Moved.' : `Moved to ${ownerName(owner)}; it stays where it is in the room.`, 'ok', [{ label: 'Undo', onClick: undo }]);
  };

  const makeStopFrom = key => {
    const node = nodeOf(key);
    if (!node) return;
    const src = parseKey(key);
    const after = src.owner !== DECOR ? src.owner : null;
    const r = change(f => makeStop(f, key, cap(node.name ?? node.label), after));
    if (!r) return;
    remark(afterRemove(src.owner, src.index));
    setView('objects');
    fresh.current = r.key;
    setRenaming(r.key);
    say(`Made a stop of ${node.label}. Name it: its id and page follow the name; its camera and marker are placed from the object.`, 'ok', [{ label: 'Undo', onClick: undo }]);
  };

  const askDissolve = (file, owner = DECOR) => {
    const stop = sceneTree(latest.current).stops.find(s => s.file === file);
    if (!stop) return;
    const refs = stopRefs(latest.current, file);
    setAsk({
      title: owner === DECOR ? `Turn “${stop.label}” into scenery?` : `Merge “${stop.label}” into ${ownerName(owner)}?`,
      lines: [
        `${cap(plural(stop.objects.length, 'object'))} go to ${ownerName(owner)}, staying where they are in the room.`,
        `The stop's label, camera and marker go${stop.markdown ? `, and its page ${stop.markdown} is deleted` : ''}.`,
        ...(refs.length ? ['These point at it and will lead nowhere:', ...refs.map(r => `  ${r}`)] : []),
        'Undo (⌘Z / Ctrl+Z) brings it all back.',
      ],
      actions: [
        { label: owner === DECOR ? 'Turn into scenery' : 'Merge', primary: true, onClick: () => {
          const n = count(latest.current, owner);
          const r = change(f => dissolveStop(f, file, owner));
          if (!r) return;
          remark(k => (k.startsWith(`${file}:`) ? objectKey(owner, n + parseKey(k).index) : k));
          say(`“${stop.label}” is now part of ${ownerName(owner)}.`, 'ok', [{ label: 'Undo', onClick: undo }]);
        } },
        { label: 'Cancel' },
      ],
    });
  };

  const askDeleteStop = file => {
    const stop = sceneTree(latest.current).stops.find(s => s.file === file);
    if (!stop) return;
    const refs = stopRefs(latest.current, file);
    setAsk({
      title: `Delete the stop “${stop.label}”?`,
      lines: [
        `Its ${plural(stop.objects.length, 'object')}, its file ${file}${stop.markdown ? ` and its page ${stop.markdown}` : ''} are deleted. To keep the objects, turn it into scenery instead.`,
        ...(refs.length ? ['These point at it and will lead nowhere:', ...refs.map(r => `  ${r}`)] : []),
        'Undo (⌘Z / Ctrl+Z) brings it all back.',
      ],
      actions: [
        { label: 'Delete stop', primary: true, danger: true, onClick: () => {
          if (!change(f => deleteStop(f, file))) return;
          remark(k => (k.startsWith(`${file}:`) ? null : k));
          say(`Deleted “${stop.label}”.`, 'ok', [{ label: 'Undo', onClick: undo }]);
        } },
        { label: 'Turn into scenery instead', onClick: () => askDissolve(file) },
        { label: 'Cancel' },
      ],
    });
  };

  /** Belongs to: the scenery, a stop, or a new stop of its own. The last object of a stop takes the whole stop along. */
  const onBelongs = (key, to) => {
    const { owner } = parseKey(key);
    if (to === owner) return;
    if (to === 'new') { makeStopFrom(key); return; }
    const stop = sceneTree(latest.current).stops.find(s => s.file === owner);
    if (stop && stop.objects.length === 1) { askDissolve(owner, to); return; }
    moveTo(key, to);
  };

  const onDelete = row => {
    if (row.kind === 'stop') { askDeleteStop(row.file); return; }
    if (row.kind !== 'object') return;
    const stop = tree.stops.find(s => s.file === row.owner);
    if (stop && stop.objects.length === 1) { askDeleteStop(stop.file); return; }
    if (!change(f => deleteObject(f, row.key))) return;
    remark(afterRemove(row.owner, row.index));
    say(`Deleted ${row.label}.`, 'ok', [{ label: 'Undo', onClick: undo }]);
  };

  const onDuplicate = row => {
    if (row.kind !== 'object') return;
    if (change(f => duplicateObject(f, row.key))) remark(afterInsert(row.owner, row.index + 1));
  };

  /** Alt+↑ ↓ or Move up / down: a stop in the tour, an object in its list. */
  const onStep = (row, dir) => {
    if (row.kind === 'stop') { change(f => moveStop(f, row.file, row.n + dir)); return; }
    if (row.kind !== 'object') return;
    const to = row.index + (dir > 0 ? 2 : -1);
    if (to < 0 || (dir > 0 && row.index + 1 >= count(latest.current, row.owner))) return;
    moveTo(row.key, row.owner, to);
  };

  const onDrop = (drag, row, where) => {
    if (drag.kind === 'object') {
      if (row.key === 'scenery') onBelongs(drag.key, DECOR);
      else if (row.kind === 'stop') onBelongs(drag.key, row.file);
      else if (row.kind === 'object') {
        const stop = tree.stops.find(s => s.file === drag.owner);
        if (drag.owner !== row.owner && stop?.objects.length === 1) askDissolve(drag.owner, row.owner);
        else moveTo(drag.key, row.owner, row.index + (where === 'after' ? 1 : 0));
      }
      return;
    }
    if (row.key === 'scenery') { askDissolve(drag.file); return; }
    if (row.key === 'stops') { change(f => moveStop(f, drag.file, tree.stops.length - 1)); return; }
    const to = row.n + (where === 'after' ? 1 : 0);
    change(f => moveStop(f, drag.file, to > drag.n ? to - 1 : to));
  };

  const toggleMark = (which, keys) => {
    const set = new Set(useStore.getState().edit[which]);
    const all = keys.every(k => set.has(k));
    for (const k of keys) if (all) set.delete(k); else set.add(k);
    useStore.getState().setEdit({ [which]: set });
  };
  const allObjectKeys = () => [...tree.decor.map(o => o.key), ...tree.stops.flatMap(s => s.objects.map(o => o.key))];
  const onlyStop = stop => useStore.getState().setEdit({ hidden: new Set(allObjectKeys().filter(k => !k.startsWith(`${stop.file}:`))) });

  const onRename = (row, text) => {
    const isNew = fresh.current === row.key;
    fresh.current = null;
    if (row.kind !== 'stop') change(f => renameObject(f, row.key, text));
    else if (isNew) {
      // the first name of a stop just made: its id and files take the name too (nothing points at it yet)
      const r = change(f => renameNewStop(f, row.file, text));
      if (r?.file) remark(k => (k.startsWith(`${row.file}:`) ? `${r.file}:${parseKey(k).index}` : k));
    } else if (text.trim()) change(f => setField(f, row.file, ['label'], text.trim()));
  };

  const onStop = (kind, file) => {
    if (kind === 'camera') { change(f => setField(f, file, ['camera'], currentPose())); say('The stop is seen from where the camera is now.'); }
    else if (kind === 'dissolve') askDissolve(file);
    else if (kind === 'delete') askDeleteStop(file);
  };

  const openFile = path => { setView('files'); setSel(path); };

  const onPick = type => {
    setAdding(false);
    const st = useStore.getState();
    const taken = [...(st.scene?.decor ?? []), ...st.pois.flatMap(q => q.objects)].map(o => o.position);
    const spot = viewSpot(runtime.pose, st.scene?.room, taken);
    const r = change(f => addToScenery(f, { ...objectTemplate(type, registry), ...spot }));
    if (!r) return;
    setView('objects');
    say(`Added ${type} to the scenery, where the camera looks.`, 'ok', [
      { label: 'Make it a stop', onClick: () => makeStopFrom(r.key) },
      { label: 'Undo', onClick: undo },
    ]);
  };

  /** The dialog's result: `{ type: url }`, written as one change; the palette opens on the new types once they are built. */
  const onAddTypes = decls => {
    const had = prefabDecls(latest.current);
    const types = Object.keys(decls).filter(t => had[t] !== decls[t]);
    const r = change(f => addPrefabDecls(f, decls));
    if (!r) return;
    openPalette.current = true;
    if (!types.length) { say('Those types were already in the scene.'); setAdding(true); return; }
    say(`Added ${types.length === 1 ? `the type ${types[0]}` : `${types.length} types: ${types.join(', ')}`}. Find ${types.length === 1 ? 'it' : 'them'} under “From the web” in + Add.`, 'ok', [{ label: 'Undo', onClick: undo }]);
  };
  const onRemoveType = type => {
    // refused while objects use the type: `change` says why
    if (change(f => removePrefabDecl(f, type))) say(`Removed the type ${type} from the scene.`, 'ok', [{ label: 'Undo', onClick: undo }]);
  };

  const menuFor = row => {
    const ed = useStore.getState().edit;
    if (row.kind === 'object') {
      const stop = tree.stops.find(s => s.file === row.owner);
      const only = stop?.objects.length === 1;
      return [
        { label: 'Fly to it', hint: 'F', onClick: () => frame(row.key) },
        { label: 'Rename', hint: 'F2', onClick: () => setRenaming(row.key) },
        { label: 'Duplicate', hint: '⌘D', onClick: () => onDuplicate(row) },
        '-',
        { label: 'Make it a stop', onClick: () => makeStopFrom(row.key), disabled: only },
        { heading: 'Move to' },
        ...(row.owner !== DECOR ? [{ label: only ? 'Scenery (with its stop)' : 'Scenery', onClick: () => onBelongs(row.key, DECOR) }] : []),
        ...tree.stops.filter(s => s.file !== row.owner && !s.bad).map(s => ({ label: `${String(s.n + 1).padStart(2, '0')} ${s.label}`, onClick: () => onBelongs(row.key, s.file) })),
        '-',
        { label: ed.hidden.has(row.key) ? 'Show' : 'Hide', hint: 'H', onClick: () => toggleMark('hidden', [row.key]) },
        { label: ed.locked.has(row.key) ? 'Unlock' : 'Lock', onClick: () => toggleMark('locked', [row.key]) },
        { label: 'Delete', hint: 'Del', danger: true, onClick: () => onDelete(row) },
      ];
    }
    if (row.kind === 'stop') {
      return [
        { label: 'Go there', hint: 'Enter', onClick: () => frame(row.key) },
        { label: 'Rename', hint: 'F2', onClick: () => setRenaming(row.key) },
        { label: 'Move up', hint: 'Alt+↑', onClick: () => onStep(row, -1), disabled: row.n === 0 },
        { label: 'Move down', hint: 'Alt+↓', onClick: () => onStep(row, 1), disabled: row.n === tree.stops.length - 1 },
        '-',
        { label: 'Show only this stop', onClick: () => onlyStop(row) },
        { label: 'Show everything', onClick: () => useStore.getState().setEdit({ hidden: new Set() }), disabled: !ed.hidden.size },
        ...(row.markdown ? [{ label: 'Edit page', onClick: () => openFile(row.markdown) }] : []),
        '-',
        { label: 'Turn into scenery', onClick: () => askDissolve(row.file), disabled: row.bad },
        { label: 'Delete stop', hint: 'Del', danger: true, onClick: () => askDeleteStop(row.file) },
      ];
    }
    if (row.key === 'scenery') {
      const keys = tree.decor.map(o => o.key);
      const locked = keys.length && keys.every(k => ed.locked.has(k));
      return [
        { label: 'Add…', onClick: () => setAdding(true) },
        { label: locked ? 'Unlock all scenery' : 'Lock all scenery', onClick: () => toggleMark('locked', keys), disabled: !keys.length },
        { label: 'Show everything', onClick: () => useStore.getState().setEdit({ hidden: new Set() }), disabled: !ed.hidden.size },
      ];
    }
    if (row.key === 'room') return [{ label: 'Whole room view', hint: 'Enter', onClick: () => frame('room') }, { label: 'Open scene.json', onClick: () => openFile('scene.json') }];
    return [{ label: 'Show everything', onClick: () => useStore.getState().setEdit({ hidden: new Set() }), disabled: !ed.hidden.size }];
  };

  // ── files, import, export ───────────────────────────────────────────────────

  const update = text => commit(new Map(latest.current).set(sel, text), { typing: true });
  const setOpts = patch => change(f => withExportOptions(f, { ...exportOptions(f), ...patch }));
  const onStart = v => setOpts({ start: v === '' ? null : v === 'pose' ? (pose ?? currentPose()) : v.slice(4) });

  /** Put files in memory (path → bytes), replacing what was there under the same path; `all` drops the rest first. */
  const hold = (entries, all = false) => setAssets(prev => {
    const next = all ? new Map() : new Map(prev);
    for (const [p, { url }] of prev) if (all || entries.has(p)) URL.revokeObjectURL(url);
    for (const [p, bytes] of entries) next.set(p, held(p, bytes));
    return next;
  });

  const onImport = async list => {
    setExporting(true);
    try {
      const zips = list.filter(f => /\.zip$/i.test(f.name)), loose = list.filter(f => !/\.zip$/i.test(f.name));
      const done = [];
      for (const z of zips) {
        const r = importZip(await readZip(new Uint8Array(await z.arrayBuffer())));
        if (!r) throw new Error(`${z.name} holds no scene.json`);
        if (r.name) setName(SCENE_NAME.test(r.name) ? r.name : slug(r.name));
        commit(r.files); setSel('scene.json'); hold(r.assets, true); setMissing(new Set());
        useStore.getState().setEdit({ selected: null, hovered: null, hidden: new Set(), locked: new Set() });
        done.push(`${z.name}: ${plural(r.files.size, 'text file')} and ${plural(r.assets.size, 'other file')}`);
      }
      if (loose.length) {
        hold(new Map(await Promise.all(loose.map(async f => [`media/${f.name}`, new Uint8Array(await f.arrayBuffer())]))));
        done.push(`${plural(loose.length, 'file')} into media/`);
      }
      setNote({ kind: 'ok', text: `Imported ${done.join('; ')}.` });
    } catch (e) {
      setNote({ kind: 'bad', text: `Import failed: ${e.message}` });
    }
  };

  /** The files the zip gets besides the text files: from memory first, then the published folder. */
  const collect = async () => {
    const out = new Map(), lost = new Set();
    await Promise.all(extra.map(async p => {
      const mem = assets.get(p);
      if (mem) { out.set(p, mem.bytes); return; }
      if (!base.current) { lost.add(p); return; }
      try { out.set(p, await fetchBytes(new URL(p, base.current))); } catch { lost.add(p); }
    }));
    setMissing(lost);
    return { out, lost };
  };

  const onExport = async kind => {
    const site = kind === 'site';
    setNote({ kind: 'busy', text: site ? 'Building the viewer…' : 'Collecting files…' });
    try {
      let viewer = new Map();
      if (site) {
        const root = new URL(VIEWER_BASE, location.href);
        const res = await fetch(new URL('viewer.json', root), { cache: 'no-store' });
        if (!res.ok) throw new Error(`the viewer's file list: ${(await res.text()) || `HTTP ${res.status}`}`);
        const { files: list } = await res.json();
        setNote({ kind: 'busy', text: 'Collecting files…' });
        viewer = new Map(await Promise.all(list.map(async p => [p, await fetchBytes(new URL(p, root), { html: p.endsWith('.html') })])));
      }
      const { out, lost } = await collect();
      const entries = site ? bundleEntries({ name: safe, files, assets: out, viewer }) : folderEntries({ name: safe, files, assets: out });
      download(makeZip(entries), site ? `${safe}-site.zip` : `${safe}.zip`);
      const where = site ? `scenes/${safe}/` : `${safe}/`;
      setNote({ kind: lost.size ? 'bad' : 'ok', text: `Exported ${plural(entries.size, 'file')}${lost.size ? `; ${lost.size} could not be fetched and must be added to ${where} by hand` : ''}.` });
    } catch (e) {
      setNote({ kind: 'bad', text: `Export failed: ${e.message}` });
    }
  };

  // Preview shows the room as visitors see it, so it also lets go of the selection (and with it the handles and outline)
  const setMode = mode => { document.body.style.cursor = ''; useStore.getState().setEdit({ mode, hovered: null, ...(mode === 'preview' ? { selected: null, part: null } : {}) }); };
  const closeMenu = useCallback(() => setMenu(null), []);

  const setTool = tool => useStore.getState().setEdit({ tool });
  /** The handles in the room dropped an object: its new position and / or rotation, one undo step; false if the file refused. */
  const transform = (key, { position, rotation }) => !!change(f => {
    let next = f;
    if (position) next = setObjectField(next, key, ['position'], position);
    if (rotation) next = setObjectField(next, key, ['rotation'], rotation);
    return { files: next, key };
  });

  // anywhere on the page except while typing in a field (which has its own undo) or in the tree (which takes letters):
  // undo and redo, G to move and R to rotate with the handles
  const keys = useRef(null);
  keys.current = { undo, redo, transform };
  useEffect(() => {
    const onKey = e => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const k = e.key.toLowerCase();
      if (!(e.metaKey || e.ctrlKey)) {
        if (!e.altKey && (k === 'g' || k === 'r')) useStore.getState().setEdit({ tool: k === 'g' ? 'move' : 'rotate' });
        return;
      }
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); keys.current.undo(); } else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); keys.current.redo(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <aside className="editor" aria-label="Scene editor">
        <div className="editor-bar">
          <span className="brand">Editor</span>
          <label>folder <input value={name} onChange={e => setName(e.target.value)} size={10} pattern={SCENE_NAME.source} title="letters, digits, - and _" /></label>
          <button type="button" className="btn ghost" onClick={() => picker.current?.click()} title="A scene zip (folder or whole site) to go on with, or media files to add to media/">Import…</button>
          <input ref={picker} type="file" multiple accept=".zip,image/*,video/*,audio/*,.js,.json,.glb,.gltf,.m3u8" hidden aria-label="Files to import" onChange={e => { const l = [...e.target.files]; e.target.value = ''; if (l.length) onImport(l); }} />
          <button type="button" className="btn" onClick={() => setExporting(x => !x)} disabled={!files} aria-expanded={exporting} title="The scene folder, or a whole site with the viewer, as a zip">Export…</button>
        </div>
        {exporting && files && (
          <section className="editor-export" aria-label="Export">
            <label><input type="checkbox" checked={opts.freeFly} onChange={e => setOpts({ freeFly: e.target.checked })} /> Allow free flight (W A S D, middle-drag)</label>
            <div className="row">
              <label>opens at
                <select value={startValue} onChange={e => onStart(e.target.value)} aria-label="Where the scene opens">
                  <option value="">whole room</option>
                  {pois.map(p => <option key={p.id} value={`poi:${p.id}`}>{p.label}</option>)}
                  <option value="pose">fixed view</option>
                </select>
              </label>
              <button type="button" className="btn ghost" onClick={() => setOpts({ start: currentPose() })} title="Open the scene where the camera is now: fly there first (W A S D, middle-drag)">Use current view</button>
            </div>
            {pose && <div className="pose">{fmtPose(pose)}</div>}
            <div className="note">
              Besides the {plural(files.size, 'text file')}, the zip gets {extra.length === 0 ? 'no other files' : `${plural(extra.length, 'file')}: those the scene refers to${assets.size ? ', and those imported' : ''}`}{!base.current && extra.some(p => !assets.has(p)) ? ' (this scene has no published folder, so files not imported cannot be fetched)' : ''}.
              Files a prefab module loads itself and media a feed answers with are not found by reading the scene: import them, or add them to the unzipped folder by hand.
            </div>
            {(extra.length > 0 || hosted.length > 0) && (
              <ul className="files">
                {extra.map(r => <li key={r} className={missing.has(r) ? 'missing' : assets.has(r) ? 'held' : ''}>{r}{assets.has(r) ? ' · in memory' : ''}</li>)}
                {hosted.map(u => <li key={u} className="hosted" title="A module from the web is not copied into the zip; the scene keeps its address">{u} · stays on its host</li>)}
              </ul>
            )}
            <div className="row">
              <button type="button" className="btn ghost" onClick={() => onExport('folder')} disabled={note?.kind === 'busy'} title={`${safe}/ to drop into a site's scenes/ next to other scenes`}>Scene folder .zip</button>
              <button type="button" className="btn" onClick={() => onExport('site')} disabled={note?.kind === 'busy' || REMOTE_SCENES} title="The viewer and this scene: a complete site for its own address">Whole site .zip</button>
            </div>
            {REMOTE_SCENES && <div className="bad">This viewer was built with VITE_SCENES_BASE and reads scenes from there, so it cannot be bundled with one.</div>}
            {note && <div className={note.kind} role={note.kind === 'bad' ? 'alert' : 'status'}>{note.text}</div>}
          </section>
        )}
        <div className="editor-bar">
          <span className="add-wrap">
            <button type="button" className="btn" onClick={() => setAdding(a => !a)} disabled={!files} aria-expanded={adding} title="Add an object to the scenery, where the camera looks">+ Add</button>
            {adding && <AddMenu registry={registry} onPick={onPick} onClose={() => setAdding(false)} onAddType={() => { setAdding(false); setAddingType(true); }} />}
          </span>
          <button type="button" className="btn ghost icon" onClick={undo} disabled={!hist.current.past.length} title="Undo (⌘Z / Ctrl+Z)" aria-label="Undo">↶</button>
          <button type="button" className="btn ghost icon" onClick={redo} disabled={!hist.current.future.length} title="Redo (⇧⌘Z / Ctrl+Y)" aria-label="Redo">↷</button>
          <span className="seg" role="group" aria-label="What a click in the room does">
            <button type="button" aria-pressed={edit?.mode !== 'select'} onClick={() => setMode('preview')} title="Clicks in the room work as for visitors: screens zoom, actions run; the selection is cleared">Preview</button>
            <button type="button" aria-pressed={edit?.mode === 'select'} onClick={() => setMode('select')} title="A click in the room selects the object under the pointer; a double-click flies to it">Select</button>
          </span>
          <span className="seg" role="group" aria-label="What the handles on the selected object do">
            <button type="button" aria-pressed={edit?.tool !== 'rotate'} onClick={() => setTool('move')} title="Arrows and squares on the selected object move it along the room's axes (G); Shift: no 10 cm steps">Move</button>
            <button type="button" aria-pressed={edit?.tool === 'rotate'} onClick={() => setTool('rotate')} title="Rings on the selected object turn it (R); Shift: no 15° steps">Rotate</button>
          </span>
          {(Object.keys(registry.extra).length > 0 || hasTransforms) && (
            <button type="button" className="btn ghost icon" onClick={() => setBust(b => b + 1)} title="Reload modules: import the scene's prefab and transform modules again" aria-label="Reload modules">⟳</button>
          )}
        </div>
        <div className="editor-tabs">
          <span className="seg" role="tablist" aria-label="Show">
            <button type="button" role="tab" aria-selected={view === 'objects'} onClick={() => setView('objects')}>Objects</button>
            <button type="button" role="tab" aria-selected={view === 'files'} onClick={() => setView('files')}>Files</button>
          </span>
          {view === 'objects' && (
            <input className="filter" type="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter: name, or t:type" aria-label="Filter the tree"
              onKeyDown={e => { if (e.key === 'Escape') setFilter(''); }} />
          )}
        </div>
        {view === 'objects' ? (
          <div className="editor-objects">
            <Tree
              tree={tree} errors={errorMap} selected={selected} hovered={edit?.hovered ?? null} current={current}
              hidden={edit?.hidden ?? new Set()} locked={edit?.locked ?? new Set()} expanded={expanded} setExpanded={setExpanded}
              filter={filter} renaming={renaming} setRenaming={setRenaming} registry={registry}
              onSelect={(key, { fly } = {}) => { select(key); if (fly) frame(key); }}
              onActivate={frame}
              onHover={key => useStore.getState().setEdit({ hovered: key })}
              onRename={onRename}
              onMenu={(row, x, y) => setMenu({ x, y, items: menuFor(row) })}
              onDrop={onDrop}
              onReject={msg => say(msg, 'bad')}
              onDelete={onDelete} onDuplicate={onDuplicate} onStep={onStep}
              onHide={keys => toggleMark('hidden', keys)} onLock={keys => toggleMark('locked', keys)}
            />
            <section className="inspector" aria-label="Inspector">
              {(errorMap.get(selected) ?? []).map((l, i) => <div key={i} className="bad">{l}</div>)}
              <Inspector selKey={selected} tree={tree} files={files} registry={registry} edit={change} onBelongs={onBelongs} onStop={onStop} openFile={openFile} onAdd={() => setAdding(true)}
                typeErrors={typeErrors} onAddType={() => setAddingType(true)} onRemoveType={onRemoveType} onReload={() => setBust(b => b + 1)} />
            </section>
          </div>
        ) : (
          <>
            <ul className="editor-files">
              {paths.map(p => (
                <li key={p}>
                  <button type="button" aria-current={p === sel} className={badFiles.has(p) ? 'bad' : ''} onClick={() => setSel(p)}>{p}</button>
                </li>
              ))}
            </ul>
            <textarea
              value={files?.get(sel) ?? ''}
              onChange={e => update(e.target.value)}
              spellCheck={false}
              aria-label={`Contents of ${sel}`}
              disabled={!files || !files.has(sel)}
            />
          </>
        )}
        {toast && (
          <div className={`editor-toast ${toast.kind}`} role={toast.kind === 'bad' ? 'alert' : 'status'}>
            <span>{toast.text}</span>
            {toast.actions.map(a => <button key={a.label} type="button" className="btn ghost" onClick={() => { setToast(null); a.onClick(); }}>{a.label}</button>)}
            <button type="button" className="close" aria-label="Dismiss" onClick={() => setToast(null)}>×</button>
          </div>
        )}
        {errors.length ? (
          <ul className="editor-errors" role="alert">{errors.map((l, i) => <li key={i}>{l}</li>)}</ul>
        ) : (
          <div className="editor-ok">{status}</div>
        )}
        {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}
        {ask && <ConfirmBox {...ask} onClose={() => setAsk(null)} />}
        {addingType && files && <AddTypeDialog files={files} resolveUrl={resolveUrl} loadModule={loadModule} onAdd={onAddTypes} onClose={() => setAddingType(false)} />}
      </aside>
      <Viewer />
    </>
  );
}

/** How many objects an owner (the scenery or a stop file) holds. */
function count(files, owner) {
  const t = sceneTree(files);
  return (owner === DECOR ? t.decor : t.stops.find(s => s.file === owner)?.objects ?? []).length;
}
