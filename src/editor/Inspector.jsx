import { useEffect, useState } from 'react';
import { DECOR, parseKey, objectAt, objectRaw, setObjectField, setObjectRaw, setField, renameObject, prefabDecls, typeUses } from './tree.js';
import { propFields, changed } from './form.js';
import { glyphOf, isHosted } from './types.js';
import { NumberField, TextField, JsonField, parseJson } from './fields.jsx';
import { ScreenEditor, PartActions, screenProps } from './ScreenEditor.jsx';

/**
 * The selected node's settings under the tree. An object gets a form generated from its prefab's schema
 * (a changed prop is marked and can be reset to its default; screens get their own editor, src/editor/ScreenEditor.jsx,
 * and every clickable part a choice of what a click does) or its own JSON; **Belongs to** moves it to the
 * scenery or a stop, or makes it a stop of its own. A stop gets its label, camera, marker and page; the room
 * its title and size. Every field writes the files through `edit`, so the Files view and undo follow.
 */

function Vec({ label, value, onCommit }) {
  const v = Array.isArray(value) && value.length === 3 ? value : [0, 0, 0];
  return (
    <div className="prop">
      <span className="name">{label}</span>
      <span className="vec">{['x', 'y', 'z'].map((a, i) => (
        <NumberField key={a} label={`${label} ${a}`} value={v[i]} onCommit={n => onCommit(v.map((x, j) => (j === i ? n : x)))} />
      ))}</span>
    </div>
  );
}

function PropField({ f, written, def, onSet }) {
  const value = written === undefined ? def : written;
  const isChanged = changed(written, def);
  let input;
  if (f.kind === 'boolean') input = <input type="checkbox" aria-label={f.key} checked={!!value} onChange={e => onSet(e.target.checked)} />;
  else if (f.kind === 'number') input = <NumberField label={f.key} value={value} nullable={f.nullable} int={f.int} min={f.min} onCommit={onSet} />;
  else if (f.kind === 'string') input = <TextField label={f.key} value={value} nullable={f.nullable} placeholder={f.nullable ? 'none' : ''} onCommit={onSet} />;
  else if (f.kind === 'enum') {
    input = (
      <select aria-label={f.key} value={value ?? ''} onChange={e => onSet(e.target.value === '' ? null : e.target.value)}>
        {f.nullable && <option value="">none</option>}
        {f.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else input = <JsonField label={f.key} value={value} onCommit={onSet} />;
  return (
    <div className={`prop${isChanged ? ' changed' : ''}${f.kind === 'json' ? ' wide' : ''}`} title={isChanged ? 'Changed from the default' : undefined}>
      <span className="name">{f.key}</span>
      {input}
      {written !== undefined && <button type="button" className="reset" title={`Back to the default (${JSON.stringify(def)})`} aria-label={`Reset ${f.key}`} onClick={() => onSet(undefined)}>↺</button>}
    </div>
  );
}

function ObjectInspector({ files, node, tree, registry, edit, onBelongs }) {
  const [tab, setTab] = useState('form');
  const obj = objectAt(files, node.key);
  const entry = registry.has(obj?.type) ? registry.get(obj.type) : null;
  const set = (path, v) => edit(f => setObjectField(f, node.key, path, v));
  const owner = parseKey(node.key).owner;
  const ownerStop = tree.stops.find(s => s.file === owner);
  if (!obj || typeof obj !== 'object') return <div className="insp-empty">This object is not an object in the JSON: fix it in Files.</div>;
  return (
    <>
      <div className="insp-head">
        <span className="ico" aria-hidden="true">{glyphOf(obj.type, registry)}</span>
        <TextField label="Name" value={obj.name ?? ''} placeholder={node.label} onCommit={v => edit(f => renameObject(f, node.key, v ?? ''))} />
        <span className="sub" title={entry?.title && entry.title !== obj.type ? obj.type : undefined}>{entry?.title ?? obj.type}</span>
      </div>
      <label className="prop">
        <span className="name">Belongs to</span>
        <select value={owner} onChange={e => onBelongs(node.key, e.target.value)} aria-label="Belongs to">
          <option value={DECOR}>Scenery</option>
          {tree.stops.map(s => <option key={s.file} value={s.file} disabled={s.bad}>{String(s.n + 1).padStart(2, '0')} {s.label}</option>)}
          <option value="new" disabled={ownerStop?.objects.length === 1}>New stop with this object…</option>
        </select>
      </label>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'form'} onClick={() => setTab('form')}>Form</button>
        <button type="button" role="tab" aria-selected={tab === 'json'} onClick={() => setTab('json')}>JSON</button>
      </div>
      {tab === 'json' ? <RawObject files={files} k={node.key} edit={edit} /> : (
        <div className="form">
          <Vec label="position" value={obj.position} onCommit={v => set(['position'], v)} />
          <Vec label="rotation" value={obj.rotation ?? [0, 0, 0]} onCommit={v => set(['rotation'], v)} />
          {Array.isArray(obj.scale)
            ? <Vec label="scale" value={obj.scale} onCommit={v => set(['scale'], v)} />
            : <div className="prop"><span className="name">scale</span><NumberField label="scale" value={obj.scale ?? 1} min={0.001} onCommit={v => set(['scale'], v === 1 ? undefined : v)} /></div>}
          {entry ? (
            <>
              {propFields(entry.schema).filter(f => !screenProps(entry, obj).has(f.key)).map(f => <PropField key={f.key} f={f} written={obj.props?.[f.key]} def={entry.props[f.key]} onSet={v => set(['props', f.key], v)} />)}
              <ScreenEditor objKey={node.key} obj={obj} entry={entry} edit={edit} files={files} tree={tree} registry={registry} />
              <PartActions objKey={node.key} obj={obj} entry={entry} edit={edit} files={files} tree={tree} registry={registry} />
            </>
          ) : <div className="insp-empty">Unknown type <code>{obj.type}</code>: edit it in JSON.</div>}
        </div>
      )}
    </>
  );
}

/** The object's own JSON, written as typed once it parses. */
function RawObject({ files, k, edit }) {
  const raw = objectRaw(files, k) ?? '';
  const [text, setText] = useState(raw);
  const [bad, setBad] = useState(null);
  useEffect(() => { setText(raw); setBad(null); }, [raw]);
  const onChange = t => {
    setText(t);
    const r = parseJson(t);
    setBad(r.ok ? null : r.msg);
    if (r.ok) edit(f => setObjectRaw(f, k, t), { typing: true });
  };
  return (
    <>
      <textarea className="json big" value={text} spellCheck={false} aria-label="The object as JSON" onChange={e => onChange(e.target.value)} />
      {bad && <div className="bad">{bad}</div>}
    </>
  );
}

function StopInspector({ files, node, edit, onStop, openFile }) {
  const poi = (() => { try { return JSON.parse(files.get(node.file)); } catch { return null; } })();
  if (!poi) return <div className="insp-empty">{node.file} is missing or not valid JSON: fix it in Files.</div>;
  const set = (path, v) => edit(f => setField(f, node.file, path, v));
  return (
    <>
      <div className="insp-head">
        <span className="ico" aria-hidden="true">{String(node.n + 1).padStart(2, '0')}</span>
        <TextField label="Label" value={poi.label} onCommit={v => v && set(['label'], v)} />
      </div>
      <div className="form">
        <div className="prop"><span className="name">kicker</span><TextField label="kicker" value={poi.kicker ?? ''} placeholder="a line above the title" onCommit={v => set(['kicker'], v || undefined)} /></div>
        <div className="prop"><span className="name">id</span><code title="Used in #links and actions; change it in Files">{poi.id}</code></div>
        <div className="prop wide">
          <span className="name">camera</span>
          <span className="value">{poi.camera ? 'fixed' : 'placed from its first object'}</span>
          <button type="button" className="btn ghost" onClick={() => onStop('camera', node.file)} title="Fly where the stop should be seen from first">Use current view</button>
          {poi.camera && <button type="button" className="btn ghost" onClick={() => set(['camera'], undefined)}>Place from object</button>}
        </div>
        <div className="prop wide">
          <span className="name">marker</span>
          <span className="value">{poi.marker ? 'fixed' : 'placed from its first object'}</span>
          {poi.marker && <button type="button" className="btn ghost" onClick={() => set(['marker'], undefined)}>Place from object</button>}
        </div>
        <div className="prop wide">
          <span className="name">page</span>
          {typeof poi.content?.markdown === 'string'
            ? <><code>{poi.content.markdown}</code><button type="button" className="btn ghost" onClick={() => openFile(poi.content.markdown)}>Edit page</button></>
            : <span className="value">written as blocks in {node.file}</span>}
        </div>
        <div className="row">
          <button type="button" className="btn ghost" onClick={() => onStop('dissolve', node.file)}>Turn into scenery</button>
          <button type="button" className="btn ghost danger" onClick={() => onStop('delete', node.file)}>Delete stop</button>
          <button type="button" className="btn ghost" onClick={() => openFile(node.file)}>Open file</button>
        </div>
      </div>
    </>
  );
}

/**
 * The scene's own object types (`scene.json › prefabs`): each with where it comes from, how often it is placed and
 * what went wrong with it, a way to remove it, and the door to adding more from the web.
 */
function TypeList({ files, registry, typeErrors, onAddType, onRemoveType, onReload }) {
  const decls = prefabDecls(files);
  const types = Object.keys(decls);
  const host = url => { try { return new URL(url).host; } catch { return url; } };
  return (
    <div role="group" aria-label="Object types">
      <div className="prop wide">
        <span className="name">own types</span>
        <span className="value">{types.length ? `${types.length} besides the built-in ones` : 'none; the built-in types only'}</span>
        {types.length > 0 && <button type="button" className="btn ghost" onClick={onReload} title="Import the scene's prefab and transform modules again, after a change to their files">Reload</button>}
      </div>
      {types.length > 0 && (
        <ul className="insp-types">
          {types.map(t => {
            const entry = registry.extra[t], err = typeErrors.get(t), url = decls[t], n = typeUses(files, t).length;
            return (
              <li key={t} className={err ? 'bad' : ''}>
                <span className="ico" aria-hidden="true">{glyphOf(t, registry)}</span>
                <span className="lbl">{entry?.title ?? t}{entry?.title && entry.title !== t && <code>{t}</code>}</span>
                <button type="button" className="reset" title={`Remove the type ${t} from the scene`} aria-label={`Remove type ${t}`} onClick={() => onRemoveType(t)}>×</button>
                <span className="sub" title={url}>{isHosted(entry ?? { url }) ? `from ${host(url)}` : 'in the scene folder'} · {n === 0 ? 'not placed' : n === 1 ? 'placed once' : `placed ${n} times`}</span>
                {err && <div className="err">{err}</div>}
              </li>
            );
          })}
        </ul>
      )}
      <div className="row"><button type="button" className="btn ghost" onClick={onAddType} title="A prefab module by URL, or a catalog that lists several">+ Add a type from the web…</button></div>
    </div>
  );
}

function RoomInspector({ files, registry, edit, openFile, typeErrors, onAddType, onRemoveType, onReload }) {
  let scene = null;
  try { scene = JSON.parse(files.get('scene.json')); } catch { /* shown below */ }
  if (!scene) return <div className="insp-empty">scene.json is not valid JSON: fix it in Files.</div>;
  const set = (path, v) => edit(f => setField(f, 'scene.json', path, v));
  return (
    <div className="form">
      <div className="prop"><span className="name">title</span><TextField label="title" value={scene.title ?? ''} onCommit={v => set(['title'], v || undefined)} /></div>
      <div className="prop"><span className="name">brand</span><TextField label="brand" value={scene.brand ?? ''} placeholder="top-left logo, Word/Word" onCommit={v => set(['brand'], v || undefined)} /></div>
      {['width', 'height', 'depth'].map(k => (
        <div className="prop" key={k}><span className="name">{k}</span><NumberField label={`room ${k}`} value={scene.room?.[k]} min={1} onCommit={v => set(['room', k], v)} /></div>
      ))}
      <TypeList files={files} registry={registry} typeErrors={typeErrors} onAddType={onAddType} onRemoveType={onRemoveType} onReload={onReload} />
      <div className="note">Lights, walls, theme and the rest are in scene.json; where the room opens and free flight are in Export…</div>
      <div className="row"><button type="button" className="btn ghost" onClick={() => openFile('scene.json')}>Open scene.json</button></div>
    </div>
  );
}

export function Inspector({ selKey, tree, files, registry, edit, onBelongs, onStop, openFile, onAdd, typeErrors = new Map(), onAddType, onRemoveType, onReload }) {
  if (!files || !selKey) return <div className="insp-empty">Select something in the tree or, in Select mode, in the room.</div>;
  const k = parseKey(selKey);
  if (k.group === 'room') return <RoomInspector files={files} registry={registry} edit={edit} openFile={openFile} typeErrors={typeErrors} onAddType={onAddType} onRemoveType={onRemoveType} onReload={onReload} />;
  if (k.group === 'scenery') {
    return <div className="insp-empty">Everything you add starts here, as scenery. Make an object a stop with <strong>Belongs to</strong>, or drag it onto a stop. <button type="button" className="btn ghost" onClick={onAdd}>+ Add</button></div>;
  }
  if (k.group === 'stops') return <div className="insp-empty">The tour, in order: the number keys and ← → follow it. Drag a stop to reorder it, or press Alt+↑ ↓.</div>;
  if (k.stop) {
    const node = tree.stops.find(s => s.file === k.stop);
    return node ? <StopInspector files={files} node={node} edit={edit} onStop={onStop} openFile={openFile} /> : null;
  }
  const list = k.owner === DECOR ? tree.decor : tree.stops.find(s => s.file === k.owner)?.objects;
  const node = list?.[k.index];
  return node ? <ObjectInspector files={files} node={node} tree={tree} registry={registry} edit={edit} onBelongs={onBelongs} /> : null;
}
