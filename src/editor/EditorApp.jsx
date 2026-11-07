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
import { exportOptions, withExportOptions, sceneRefs, bundleEntries } from './export.js';
import { makeZip } from './zip.js';

const sortPaths = paths => [...paths].sort((a, b) => (a === 'scene.json' ? -1 : b === 'scene.json' ? 1 : a.localeCompare(b)));

// where the viewer's files come from for "Export site": the dev server builds them on demand, a build ships viewer.json
const VIEWER_BASE = import.meta.env.DEV ? '/__viewer/' : import.meta.env.BASE_URL;
// a viewer built to read scenes from another host would not find the scene inside the zip
const REMOTE_SCENES = !!import.meta.env.VITE_SCENES_BASE;

const round = v => Math.round(v * 100) / 100;
const fmtPose = p => `${p.position.map(round).join(', ')} looking at ${p.target.map(round).join(', ')}`;

function download(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/zip' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * The editor: the scene's files on the left, the live room on the right. Every edit is rebuilt with
 * the same `buildScene` the viewer uses, so the preview is the published result and the error
 * lines are the ones the loading screen would show. "Download" gives the folder to publish;
 * "Export…" gives a whole site (the viewer plus this one scene) with its publishing options.
 */
export function EditorApp() {
  const [name, setName] = useState(() => sceneNameFromUrl() || 'my-room');
  const [files, setFiles] = useState(null);
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
  // the Export section: open, what it is doing, and the referenced files the folder could not supply
  const [exporting, setExporting] = useState(false);
  const [note, setNote] = useState(null);
  const [missing, setMissing] = useState(() => new Set());
  // media paths resolve against the scene the editor started from (new scenes have no media yet)
  const base = useRef(null);
  const built = useRef(false);

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
          resolveUrl: p => (base.current ? new URL(p, base.current).href : p),
          loadModule: url => importModule(`${url}${url.includes('?') ? '&' : '?'}v=${bust}`),
        }));
        applyTheme(scene);
        useStore.getState().setLoaded(scene, pois);
        built.current = true;
        setErrors([]);
        setStatus(`${pois.length} point${pois.length === 1 ? '' : 's'} of interest · ${files.size} files`);
      } catch (e) {
        const lines = e instanceof ConfigError ? e.lines : [String(e.message ?? e)];
        setErrors(lines);
        if (!built.current) useStore.getState().setError(e instanceof ConfigError ? e : new ConfigError(lines));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [files, name, bust]);

  const badFiles = useMemo(() => new Set(errors.map(l => l.split(/ › |: /)[0].replace(`${name}/`, ''))), [errors, name]);
  const paths = useMemo(() => (files ? sortPaths(files.keys()) : []), [files]);
  const poiFiles = paths.filter(p => p.startsWith('poi/'));
  const target = sel.endsWith('.json') ? sel : 'scene.json';
  const safe = SCENE_NAME.test(name) ? name : slug(name);

  // publishing options and referenced files, read from the files themselves
  const opts = useMemo(() => (files ? exportOptions(files) : { freeFly: true, start: null }), [files]);
  const refs = useMemo(() => (files ? sceneRefs(files, registry) : []), [files, registry]);
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
  const onDownload = () => download(makeZip(files, { prefix: `${safe}/` }), `${safe}.zip`);

  const onExport = async () => {
    const root = new URL(VIEWER_BASE, location.href);
    setNote({ kind: 'busy', text: 'Building the viewer…' });
    try {
      const res = await fetch(new URL('viewer.json', root), { cache: 'no-store' });
      if (!res.ok) throw new Error(`the viewer's file list: ${(await res.text()) || `HTTP ${res.status}`}`);
      const { files: list } = await res.json();
      setNote({ kind: 'busy', text: 'Collecting files…' });
      const viewer = new Map(await Promise.all(list.map(async p => [p, await fetchBytes(new URL(p, root), { html: p.endsWith('.html') })])));
      const assets = new Map(), lost = new Set();
      await Promise.all(refs.map(async p => {
        if (!base.current) { lost.add(p); return; }
        try { assets.set(p, await fetchBytes(new URL(p, base.current))); } catch { lost.add(p); }
      }));
      setMissing(lost);
      download(makeZip(bundleEntries({ name: safe, files, assets, viewer })), `${safe}-site.zip`);
      const n = viewer.size + files.size + assets.size + 1;
      setNote({ kind: lost.size ? 'bad' : 'ok', text: `Exported ${n} files${lost.size ? `; ${lost.size} could not be fetched and must be added to scenes/${safe}/ by hand` : ''}.` });
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
          <button type="button" className="btn" onClick={onDownload} disabled={!files}>Download .zip</button>
          <button type="button" className="btn ghost" onClick={() => setExporting(x => !x)} disabled={!files} aria-expanded={exporting} title="A zip of the viewer and this scene only, ready for any static host">Export…</button>
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
          <section className="editor-export" aria-label="Export site">
            <label><input type="checkbox" checked={opts.freeFly} onChange={e => setOpts({ freeFly: e.target.checked })} /> Allow free flight (W A S D, middle-drag)</label>
            <div className="row">
              <label>opens at
                <select value={startValue} onChange={e => onStart(e.target.value)} aria-label="Where the site opens">
                  <option value="">whole room</option>
                  {pois.map(p => <option key={p.id} value={`poi:${p.id}`}>{p.label}</option>)}
                  <option value="pose">fixed view</option>
                </select>
              </label>
              <button type="button" className="btn ghost" onClick={() => setOpts({ start: currentPose() })} title="Open the site where the camera is now: fly there first (W A S D, middle-drag)">Use current view</button>
            </div>
            {pose && <div className="pose">{fmtPose(pose)}</div>}
            <div className="note">
              The zip holds the viewer, the {files.size} text files and {refs.length === 0 ? 'no other files' : `${refs.length} file${refs.length === 1 ? '' : 's'} they refer to`}{!base.current && refs.length > 0 ? ' (this scene has no published folder yet, so they cannot be fetched)' : ''}.
              Files a prefab module loads itself and media a feed answers with are not found here: add them to <code>scenes/{safe}/</code> by hand.
            </div>
            {refs.length > 0 && <ul className="files">{refs.map(r => <li key={r} className={missing.has(r) ? 'missing' : ''}>{r}</li>)}</ul>}
            <div className="row">
              <button type="button" className="btn" onClick={onExport} disabled={note?.kind === 'busy' || REMOTE_SCENES}>Export site .zip</button>
              {REMOTE_SCENES && <span className="bad">This viewer was built with VITE_SCENES_BASE and reads scenes from there, so it cannot be bundled with one.</span>}
            </div>
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
          To publish: download, unzip into the site&apos;s <code>scenes/</code> folder, list the folder in <code>scenes/index.json</code>, share <code>?scene={safe}</code>. Or <strong>Export…</strong> a whole site.
        </div>
      </aside>
      <Viewer />
    </>
  );
}
