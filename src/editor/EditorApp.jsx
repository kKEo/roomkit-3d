import { useEffect, useMemo, useRef, useState } from 'react';
import { Viewer } from '../App.jsx';
import { useStore } from '../state/store.js';
import { buildScene, readerFromMap } from '../config/buildScene.js';
import { scenesBase, sceneNameFromUrl, SCENE_NAME } from '../config/loadScene.js';
import { ConfigError } from '../config/schema.js';
import { applyTheme } from '../ui/theme.js';
import { PREFAB_TYPES } from '../prefabs/registry.js';
import { fetchBundle, newSceneFiles, addPoi, addObject, slug } from './bundle.js';
import { makeZip } from './zip.js';

const sortPaths = paths => [...paths].sort((a, b) => (a === 'scene.json' ? -1 : b === 'scene.json' ? 1 : a.localeCompare(b)));

/**
 * The editor: the scene's files on the left, the live room on the right. Every edit is rebuilt with
 * the same `buildScene` the viewer uses, so the preview is the published result and the error
 * lines are the ones the loading screen would show. "Download" gives the folder to publish.
 */
export function EditorApp() {
  const [name, setName] = useState(() => sceneNameFromUrl() || 'my-room');
  const [files, setFiles] = useState(null);
  const [sel, setSel] = useState('scene.json');
  const [errors, setErrors] = useState([]);
  const [status, setStatus] = useState('Loading…');
  const [addType, setAddType] = useState('desk');
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
        const { scene, pois } = await buildScene({
          name, read: readerFromMap(files),
          resolveUrl: p => (base.current ? new URL(p, base.current).href : p),
        });
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
  }, [files, name]);

  const badFiles = useMemo(() => new Set(errors.map(l => l.split(/ › |: /)[0].replace(`${name}/`, ''))), [errors, name]);
  const paths = useMemo(() => (files ? sortPaths(files.keys()) : []), [files]);
  const poiFiles = paths.filter(p => p.startsWith('poi/'));
  const target = sel.endsWith('.json') ? sel : 'scene.json';

  const update = text => setFiles(f => new Map(f).set(sel, text));
  const onAddPoi = () => {
    const label = prompt('Label of the new point of interest', `Area ${poiFiles.length + 1}`);
    if (!label) return;
    try { const r = addPoi(files, label, addType); setFiles(r.files); setSel(r.file); } catch (e) { setErrors([`scene.json: ${e.message}`]); }
  };
  const onAddObject = () => {
    try { setFiles(addObject(files, target, addType)); setSel(target); } catch (e) { setErrors([`${target}: ${e.message}`]); }
  };
  const onDownload = () => {
    const safe = SCENE_NAME.test(name) ? name : slug(name);
    const blob = new Blob([makeZip(files, { prefix: `${safe}/` })], { type: 'application/zip' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${safe}.zip` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <>
      <aside className="editor" aria-label="Scene editor">
        <div className="editor-bar">
          <span className="brand">Editor</span>
          <label>folder <input value={name} onChange={e => setName(e.target.value)} size={10} pattern={SCENE_NAME.source} title="letters, digits, - and _" /></label>
          <button type="button" className="btn" onClick={onDownload} disabled={!files}>Download .zip</button>
        </div>
        <div className="editor-bar">
          <select value={addType} onChange={e => setAddType(e.target.value)} aria-label="Prefab to add">
            {PREFAB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button type="button" className="btn ghost" onClick={onAddObject} disabled={!files}>Add to {target === 'scene.json' ? 'decor' : target.replace(/^poi\//, '')}</button>
          <button type="button" className="btn ghost" onClick={onAddPoi} disabled={!files}>New point of interest</button>
        </div>
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
          To publish: download, unzip into the site&apos;s <code>scenes/</code> folder, list the folder in <code>scenes/index.json</code>, share <code>?scene={SCENE_NAME.test(name) ? name : slug(name)}</code>.
        </div>
      </aside>
      <Viewer />
    </>
  );
}
