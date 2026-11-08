import { useEffect, useRef, useState } from 'react';
import { loadPrefab } from '../config/buildScene.js';
import { guardData } from '../config/loadScene.js';
import { fetchText } from './bundle.js';
import { isCatalogUrl, parseCatalog } from './catalog.js';
import { typeNameFromUrl, typeNameProblem } from './tree.js';

/**
 * Adds object types from the web to the scene: one module URL (`…/kiosk.js`), or a catalog URL (`…/catalog.json`)
 * that lists several. **Look up** reads the URL; **Check** imports each chosen module the way the viewer will
 * (`loadPrefab`: origin allowed, `meta` and `component` exports, defaults, SDK version) and shows what it found;
 * **Add** writes the declarations into `scene.json › prefabs` in one step. Nothing is written before Add.
 */
export function AddTypeDialog({ files, resolveUrl, loadModule, onAdd, onClose }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(null); // 'look' | 'check'
  const [bad, setBad] = useState(null);
  const [source, setSource] = useState(null); // { kind: 'module' } | { kind: 'catalog', title, url }
  const [rows, setRows] = useState([]); // { type, url, title?, blurb?, glyph?, on, result: null | { ok: entry } | { error } }
  const box = useRef(null);
  useEffect(() => { box.current?.querySelector('input')?.focus(); }, []);

  const origin = u => { try { return new URL(u).origin; } catch { return null; } };
  const taken = rows.map(r => r.type);

  const lookUp = async () => {
    const u = url.trim();
    if (!u) return;
    setBusy('look'); setBad(null); setRows([]); setSource(null);
    try {
      if (!/^https?:\/\//i.test(u)) throw new Error('give a full URL, starting with https:// (or http:// on a development server)');
      if (isCatalogUrl(u)) {
        const { title, prefabs } = parseCatalog(await fetchText(guardData(u)), u);
        setSource({ kind: 'catalog', title, url: u });
        setRows(prefabs.map(p => ({ ...p, type: typeNameFromUrl(p.url, files, []) === p.type || !typeNameProblem(p.type, files, p.url) ? p.type : typeNameFromUrl(p.url, files, []), on: true, result: null })));
      } else {
        setSource({ kind: 'module' });
        setRows([{ type: typeNameFromUrl(u, files), url: u, on: true, result: null }]);
      }
    } catch (e) {
      setBad(e.message);
    } finally { setBusy(null); }
  };

  const check = async () => {
    setBusy('check'); setBad(null);
    const next = await Promise.all(rows.map(async r => {
      if (!r.on) return { ...r, result: null };
      const problem = typeNameProblem(r.type, files, r.url) ?? (taken.filter(t => t === r.type).length > 1 ? `"${r.type}" is used twice in this list` : null);
      if (problem) return { ...r, result: { error: problem } };
      try { return { ...r, result: { ok: await loadPrefab(r.type, r.url, { resolveUrl, loadModule }) } }; } catch (e) { return { ...r, result: { error: e.message } }; }
    }));
    setRows(next);
    setBusy(null);
  };

  const setRow = (i, patch) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch, result: null } : r)));
  const ready = rows.filter(r => r.on);
  const checked = ready.length > 0 && ready.every(r => r.result?.ok);
  const add = () => { onClose(); onAdd(Object.fromEntries(ready.map(r => [r.type, r.url]))); };
  const origins = [...new Set(ready.map(r => origin(r.url)).filter(Boolean))];
  const blocked = rows.some(r => /blocked:/.test(r.result?.error ?? ''));

  return (
    <div className="editor-ask" role="dialog" aria-modal="true" aria-labelledby="add-type-title"
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}>
      <div className="box add-type" ref={box}>
        <h2 id="add-type-title">Add object types from the web</h2>
        <p className="help">The URL of a prefab module (<code>…/kiosk.js</code>), or of a catalog that lists several (<code>…/catalog.json</code>). The module stays on its host; the scene keeps only its address.</p>
        <form className="row" onSubmit={e => { e.preventDefault(); lookUp(); }}>
          <input type="url" value={url} placeholder="https://…/prefabs/kiosk.js" aria-label="Module or catalog URL" onChange={e => setUrl(e.target.value)} disabled={busy === 'look'} />
          <button type="submit" className="btn ghost" disabled={!url.trim() || busy === 'look'}>{busy === 'look' ? 'Looking up…' : 'Look up'}</button>
        </form>
        {bad && <div className="bad" role="alert">{bad}</div>}
        {source && (
          <>
            {source.kind === 'catalog' && <div className="help">Catalog{source.title ? ` “${source.title}”` : ''}: {rows.length === 1 ? 'one type' : `${rows.length} types`}. Tick the ones to add; the type name is what the scene calls it.</div>}
            <ul className="types">
              {rows.map((r, i) => (
                <li key={r.url + i} className={r.result?.error ? 'bad' : r.result?.ok ? 'ok' : ''}>
                  <label className="pick">
                    {rows.length > 1 && <input type="checkbox" checked={r.on} onChange={e => setRow(i, { on: e.target.checked })} aria-label={`Add ${r.title ?? r.type}`} />}
                    <span className="ico" aria-hidden="true">{r.result?.ok?.glyph ?? r.glyph ?? '◇'}</span>
                    <span className="lbl">{r.result?.ok?.title ?? r.title ?? r.type}</span>
                    <input className="type" value={r.type} aria-label="Type name" spellCheck={false} onChange={e => setRow(i, { type: e.target.value.trim() })} disabled={!r.on} />
                  </label>
                  <div className="sub">{r.result?.ok?.blurb ?? r.blurb ?? ''}{(r.result?.ok?.blurb ?? r.blurb) ? ' · ' : ''}<span className="url">{r.url}</span></div>
                  {r.result?.ok && (
                    <div className="sub">
                      settings: {Object.keys(r.result.ok.props).join(', ') || 'none'}
                      {r.result.ok.hotspots(r.result.ok.props).length ? ` · clickable: ${r.result.ok.hotspots(r.result.ok.props).join(', ')}` : ''}
                      {r.result.ok.media.length ? ` · files: ${r.result.ok.media.join(', ')}` : ''}
                      {r.result.ok.requires ? ` · needs SDK ${r.result.ok.requires}` : ''}
                    </div>
                  )}
                  {r.result?.error && <div className="sub err" role="alert">{r.result.error}</div>}
                </li>
              ))}
            </ul>
            {origins.length > 0 && (
              <div className="help trust">
                Code from {origins.join(', ')} will run in this page with its full rights, for you and for every visitor. Add only hosts you trust.
                {blocked && <> This viewer does not allow that host yet: whoever runs it adds the origin to <code>prefabOrigins</code> in <code>scenes/index.json</code>, or builds with <code>VITE_PREFAB_ORIGINS</code>.</>}
              </div>
            )}
          </>
        )}
        <div className="row">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          {source && <button type="button" className="btn ghost" onClick={check} disabled={!ready.length || busy != null}>{busy === 'check' ? 'Checking…' : 'Check'}</button>}
          {source && <button type="button" className="btn primary" onClick={add} disabled={!checked || busy != null} title={checked ? undefined : 'Check the modules first'}>Add {ready.length > 1 ? `${ready.length} types` : 'type'}</button>}
        </div>
      </div>
    </div>
  );
}
