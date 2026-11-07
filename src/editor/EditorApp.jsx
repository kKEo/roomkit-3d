import { useEffect, useMemo, useRef, useState } from 'react';
import { Viewer } from '../App.jsx';
import { useStore, runtime } from '../state/store.js';
import { buildScene, readerFromMap } from '../config/buildScene.js';
import { scenesBase, sceneNameFromUrl, importModule, SCENE_NAME } from '../config/loadScene.js';
import { ConfigError } from '../config/schema.js';
import { applyTheme } from '../ui/theme.js';
import { BUILTIN_REGISTRY } from '../prefabs/registry.js';
import { preloadPrefabs } from '../prefabs/preload.js';
import { fetchBundle, fetchBytes, newSceneFiles, addPoi, addObject, slug } from './bundle.js';
import { exportOptions, withExportOptions, sceneRefs, bundleEntries, folderEntries, importZip, mimeOf, cleanPath } from './export.js';
import { readZip } from './unzip.js';
import { makeZip } from './zip.js';

const sortPaths = paths => [...paths].sort((a, b) => (a === 'scene.json' ? -1 : b === 'scene.json' ? 1 : a.localeCompare(b)));

// where the viewer's files come from for "Whole site": the dev server builds them on demand, a build ships viewer.json
const VIEWER_BASE = import.meta.env.DEV ? '/__viewer/' : import.meta.env.BASE_URL;
// a viewer built to read scenes from another host would not find the scene inside the zip
const REMOTE_SCENES = !!import.meta.env.VITE_SCENES_BASE;

const round = v => Math.round(v * 100) / 100;
const fmtPose = p => `${p.position.map(round).join(', ')} looking at ${p.target.map(round).join(', ')}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function download(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/zip' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** A file held in memory (imported): its bytes and an object URL the preview can load it from. */
const held = (path, bytes) => ({ bytes, url: URL.createObjectURL(new Blob([bytes], { type: mimeOf(path) })) });

/**
 * The editor: the scene's files on the left, the live room on the right. Every edit is rebuilt with
 * the same `buildScene` the viewer uses, so the preview is the published result and the error
 * lines are the ones the loading screen would show. "Import…" takes a zip (a scene folder or a whole site)
 * or loose media files; "Export…" gives the scene folder or a whole site, with its publishing options.
 */
export function EditorApp() {
  const [name, setName] = useState(() => sceneNameFromUrl() || 'my-room');
  const [files, setFiles] = useState(null);
  // files that are not text the editor shows (media, modules, data), kept in memory after an import: path → { bytes, url }
  const [assets, setAssets] = useState(() => new Map());
  const [sel, setSel] = useState('scene.json');
  const [errors, setErrors] = useState([]);
  const [status, setStatus] = useState('Loading…');
  const [addType, setAddType] = useState('desk');
  // the prefab types the last good build knew: built-ins plus the scene's own
  const registry = useStore(s => s.scene?.registry) ?? BUILTIN_REGISTRY;
  const hasTransforms = useStore(s => Object.keys(s.scene?.transforms ?? {}).length > 0);
  const pois = useStore(s => s.pois);
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

  useEffect(() => {
    const n = sceneNameFromUrl();
    if (!n) { setFiles(newSceneFiles()); return; }
    const b = new URL(`${n}/`, scenesBase());
    base.current = b;
    fetchBundle(b).then(setFiles).catch(e => { setErrors([String(e.message)]); setFiles(newSceneFiles()); });
  }, []);

  // rebuild the scene a moment after the last keystroke
  useEffect(() => {
    if (!files) return;
    const t = setTimeout(async () => {
      try {
        const { scene, pois } = await preloadPrefabs(await buildScene({
          name, read: readerFromMap(files),
          // a file held in memory wins over the published folder
          resolveUrl: p => assets.get(cleanPath(p))?.url ?? (base.current ? new URL(p, base.current).href : p),
          loadModule: url => importModule(url.startsWith('blob:') ? url : `${url}${url.includes('?') ? '&' : '?'}v=${bust}`),
        }));
        applyTheme(scene);
        useStore.getState().setLoaded(scene, pois);
        built.current = true;
        setErrors([]);
        setStatus(`${plural(pois.length, 'point')} of interest · ${plural(files.size, 'file')}${assets.size ? ` · ${plural(assets.size, 'file')} in memory` : ''}`);
      } catch (e) {
        const lines = e instanceof ConfigError ? e.lines : [String(e.message ?? e)];
        setErrors(lines);
        if (!built.current) useStore.getState().setError(e instanceof ConfigError ? e : new ConfigError(lines));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [files, assets, name, bust]);

  const badFiles = useMemo(() => new Set(errors.map(l => l.split(/ › |: /)[0].replace(`${name}/`, ''))), [errors, name]);
  const paths = useMemo(() => (files ? sortPaths(files.keys()) : []), [files]);
  const poiFiles = paths.filter(p => p.startsWith('poi/'));
  const target = sel.endsWith('.json') ? sel : 'scene.json';
  const safe = SCENE_NAME.test(name) ? name : slug(name);

  // publishing options and referenced files, read from the files themselves
  const opts = useMemo(() => (files ? exportOptions(files) : { freeFly: true, start: null }), [files]);
  const refs = useMemo(() => (files ? sceneRefs(files, registry) : []), [files, registry]);
  // what the zip will hold besides the text files: the referenced files, plus anything imported that they don't name
  const extra = useMemo(() => [...new Set([...refs, ...assets.keys()])].filter(p => !files?.has(p)).sort(), [refs, assets, files]);
  const pose = opts.start && typeof opts.start === 'object' ? opts.start : null;
  const startValue = opts.start == null ? '' : pose ? 'pose' : `poi:${opts.start}`;

  const update = text => setFiles(f => new Map(f).set(sel, text));
  const setOpts = patch => setFiles(f => withExportOptions(f, { ...exportOptions(f), ...patch }));
  const currentPose = () => ({ position: runtime.pose.position.map(round), target: runtime.pose.target.map(round) });
  const onStart = v => setOpts({ start: v === '' ? null : v === 'pose' ? (pose ?? currentPose()) : v.slice(4) });

  const onAddPoi = () => {
    const label = prompt('Label of the new point of interest', `Area ${poiFiles.length + 1}`);
    if (!label) return;
    try { const r = addPoi(files, label, addType, registry); setFiles(r.files); setSel(r.file); } catch (e) { setErrors([`scene.json: ${e.message}`]); }
  };
  const onAddObject = () => {
    try { setFiles(addObject(files, target, addType, registry)); setSel(target); } catch (e) { setErrors([`${target}: ${e.message}`]); }
  };

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
        setFiles(r.files); setSel('scene.json'); hold(r.assets, true); setMissing(new Set());
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
        <div className="editor-bar">
          <select value={addType} onChange={e => setAddType(e.target.value)} aria-label="Prefab to add">
            {registry.types().map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button type="button" className="btn ghost" onClick={onAddObject} disabled={!files}>Add to {target === 'scene.json' ? 'decor' : target.replace(/^poi\//, '')}</button>
          <button type="button" className="btn ghost" onClick={onAddPoi} disabled={!files}>New point of interest</button>
          {(Object.keys(registry.extra).length > 0 || hasTransforms) && (
            <button type="button" className="btn ghost" onClick={() => setBust(b => b + 1)} title="Import the scene's prefab and transform modules again">Reload modules</button>
          )}
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
            {extra.length > 0 && <ul className="files">{extra.map(r => <li key={r} className={missing.has(r) ? 'missing' : assets.has(r) ? 'held' : ''}>{r}{assets.has(r) ? ' · in memory' : ''}</li>)}</ul>}
            <div className="row">
              <button type="button" className="btn ghost" onClick={() => onExport('folder')} disabled={note?.kind === 'busy'} title={`${safe}/ to drop into a site's scenes/ next to other scenes`}>Scene folder .zip</button>
              <button type="button" className="btn" onClick={() => onExport('site')} disabled={note?.kind === 'busy' || REMOTE_SCENES} title="The viewer and this scene: a complete site for its own address">Whole site .zip</button>
            </div>
            {REMOTE_SCENES && <div className="bad">This viewer was built with VITE_SCENES_BASE and reads scenes from there, so it cannot be bundled with one.</div>}
            {note && <div className={note.kind} role={note.kind === 'bad' ? 'alert' : 'status'}>{note.text}</div>}
          </section>
        )}
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
        {errors.length ? (
          <ul className="editor-errors" role="alert">{errors.map((l, i) => <li key={i}>{l}</li>)}</ul>
        ) : (
          <div className="editor-ok">{status}</div>
        )}
        <div className="editor-ok">
          To publish, <strong>Export…</strong>: a <em>scene folder</em> goes into a site&apos;s <code>scenes/</code> (list it in <code>scenes/index.json</code>, share <code>?scene={safe}</code>); a <em>whole site</em> is ready for its own address.
        </div>
      </aside>
      <Viewer />
    </>
  );
}
