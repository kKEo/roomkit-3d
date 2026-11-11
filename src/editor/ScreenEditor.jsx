import { useEffect, useMemo } from 'react';
import { useStore } from '../state/store.js';
import { GRAPH_KINDS, isHls } from '../prefabs/screenSchema.js';
import { AUTOCOMPLETE } from '../ui/blocks/schema.js';
import { objectAt } from './tree.js';
import {
  SOURCES, screenKind, screenSlots, fullProps, screenIssues, droppedBy, setScreenKey, setSource, setClick, setScreenId,
  setAction, addScreen, removeScreen, moveScreen, startScreen, inScenery, transformNames, hotspotNames,
} from './screenForm.js';
import { TextField, NumberField, JsonField, LinesField, ListField, ColorField, RowsField, Seg } from './fields.jsx';

/**
 * The inspector's part for objects with screens (a control desk's wall, a desk's monitor, a cinema screen, a scene's
 * own prefab built on `screenSchema`): pick a screen on a sketch of the wall, then set what it shows (only the keys
 * its source reads), where its live data comes from, what a click on it does and its name. Below, the actions of the
 * object's other clickable parts. Every change is one undo step written into the object's file.
 */

const Prop = ({ name, title, wide, changed, children }) => (
  <div className={`prop${wide ? ' wide' : ''}${changed ? ' changed' : ''}`} title={title}>
    <span className="name">{name}</span>
    {children}
  </div>
);
const Bad = ({ msg }) => (msg ? <div className="bad">{msg}</div> : null);

/** A screen's one-line caption on the wall sketch and in lists. */
const captionOf = s => s?.title ?? s?.label ?? (s?.src ? String(s.src).split('/').pop() : SOURCES[s?.source ?? 'rain']?.label ?? s?.source);

// ── actions ───────────────────────────────────────────────────────────────────

const ACTION_CHOICES = [
  ['goTo', 'Go to a stop'],
  ['zoom', 'Zoom into a screen'],
  ['openUrl', 'Open a link'],
  ['togglePanel', 'Show or hide the panel'],
  ['emit', 'Send an event to the page'],
];

/** A fresh action of a type, with what it needs filled in so it validates. */
function freshAction(type, stops) {
  if (type === 'goTo') return { type, poi: stops[0]?.id ?? null };
  if (type === 'openUrl') return { type, url: 'https://', confirm: true };
  if (type === 'emit') return { type, name: 'clicked' };
  return { type };
}

/** The settings of one action (where it goes, which link, …), each written as the whole action. */
function ActionFields({ action, onChange, stops, screens, self }) {
  const put = (k, v) => { const { [k]: _old, ...rest } = action; onChange(v === undefined ? rest : { ...action, [k]: v }); };
  if (action.type === 'goTo') {
    return (
      <Prop name="stop">
        <select aria-label="Go to stop" value={action.poi ?? ''} onChange={e => put('poi', e.target.value || null)}>
          <option value="">Whole room</option>
          {stops.map(s => <option key={s.id} value={s.id}>{String(s.n + 1).padStart(2, '0')} {s.label}</option>)}
        </select>
      </Prop>
    );
  }
  if (action.type === 'zoom') {
    const stop = action.poi ?? '';
    const ids = screens.filter(s => !stop || s.stop === stop);
    return (
      <>
        <Prop name="at stop" title="Where the screen is; the current stop when left out">
          <select aria-label="Screen's stop" value={stop} onChange={e => put('poi', e.target.value || undefined)}>
            <option value="">the current one</option>
            {stops.map(s => <option key={s.id} value={s.id}>{String(s.n + 1).padStart(2, '0')} {s.label}</option>)}
          </select>
        </Prop>
        <Prop name="screen" title={self ? 'Empty: this screen' : 'The screen\'s id'}>
          <select aria-label="Screen to zoom into" value={action.screen ?? ''} onChange={e => put('screen', e.target.value || undefined)}>
            <option value="">{self ? 'this screen' : 'choose…'}</option>
            {action.screen && !ids.some(s => s.id === action.screen) && <option value={action.screen}>{action.screen}</option>}
            {ids.map(s => <option key={`${s.stop}/${s.id}`} value={s.id}>{s.id} · {s.caption}</option>)}
          </select>
        </Prop>
      </>
    );
  }
  if (action.type === 'openUrl') {
    return (
      <>
        <Prop name="url"><TextField label="Link URL" value={action.url} placeholder="https://… or ?scene=other" onCommit={v => v && put('url', v)} /></Prop>
        <Prop name="label" title="A name for people, shown in the confirmation"><TextField label="Link label" value={action.label ?? ''} optional placeholder="the site's name" onCommit={v => put('label', v)} /></Prop>
        <Prop name="new tab"><input type="checkbox" aria-label="Open in a new tab" checked={action.newTab !== false} onChange={e => put('newTab', e.target.checked ? undefined : false)} /></Prop>
        <Prop name="ask first" title="Visitors see where the link goes and confirm"><input type="checkbox" aria-label="Ask before opening" checked={!!action.confirm} onChange={e => put('confirm', e.target.checked || undefined)} /></Prop>
      </>
    );
  }
  if (action.type === 'emit') {
    return (
      <>
        <Prop name="event" title="Dispatched on window as scene-rooms:<name>"><TextField label="Event name" value={action.name} onCommit={v => v && put('name', v)} /></Prop>
        <Prop name="detail" wide><JsonField label="Event detail" value={action.detail} placeholder='{ "any": "JSON" }' onCommit={v => put('detail', v)} /></Prop>
      </>
    );
  }
  return null;
}

/**
 * A clickable part's action: a choice of what happens, then its settings. `base` are the choices without an action
 * (values as given); the actions are `a:<type>`. On a screen (`self`) the zoom action means another screen.
 */
function ActionPicker({ label, value, base, onChange, stops, screens, self }) {
  const choice = typeof value === 'string' ? value : `a:${value.type}`;
  const pick = v => {
    if (!v.startsWith('a:')) return onChange(v);
    const a = freshAction(v.slice(2), stops);
    onChange(self && a.type === 'zoom' ? { ...a, screen: screens.find(s => s.id !== self)?.id } : a);
  };
  return (
    <>
      <Prop name={label}>
        <select aria-label={`${label}: what a click does`} value={choice} onChange={e => pick(e.target.value)}>
          {base.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          {ACTION_CHOICES.map(([v, t]) => <option key={v} value={`a:${v}`}>{self && v === 'zoom' ? 'Zoom into another screen' : t}</option>)}
        </select>
      </Prop>
      {typeof value === 'object' && <div className="sub-props"><ActionFields action={value} onChange={onChange} stops={stops} screens={screens} self={!!self} /></div>}
    </>
  );
}

/** Every screen of the scene that has a name an action can find it by: `{ stop (POI id), id, caption }`. */
function useScreenIds(files, tree, registry) {
  return useMemo(() => {
    const out = [];
    for (const stop of tree.stops) {
      stop.objects.forEach(o => {
        const obj = objectAt(files, o.key), entry = obj && registry.get(obj.type);
        if (!entry) return;
        for (const s of screenSlots(entry, obj)) if (s.hotspot) out.push({ stop: stop.id, id: s.hotspot, caption: captionOf(s.screen) });
      });
    }
    return out;
  }, [files, tree, registry]);
}

// ── what a screen shows ───────────────────────────────────────────────────────

const FORM_TYPES = ['text', 'email', 'tel', 'url', 'number', 'textarea'];

/** The input for one key of a screen. */
function ScreenKey({ k, screen, put }) {
  const v = screen[k];
  const fields = () => (Array.isArray(screen.columns) ? screen.columns : Array.isArray(screen.rows) && screen.rows[0] ? Object.keys(screen.rows[0]) : []);
  switch (k) {
    case 'label': return <Prop name="caption" title="Text in the middle of the rain; with it (or a colour) the screen gets its own rain"><TextField label="Rain caption" value={v ?? ''} optional placeholder="the stop's screenLabel" onCommit={x => put(k, x)} /></Prop>;
    case 'title': return <Prop name="title" title="The title bar"><TextField label="Title" value={v ?? ''} optional placeholder="none" onCommit={x => put(k, x)} /></Prop>;
    case 'color': return <Prop name="colour"><ColorField label="Colour" value={v} onCommit={x => put(k, x)} /></Prop>;
    case 'src': return (
      <>
        <Prop name={screen.source === 'video' ? 'video' : 'image'} title="A path in the scene folder, or a URL"><TextField label="Media file" value={v ?? ''} optional placeholder={screen.source === 'video' ? 'media/clip.mp4 or …/live.m3u8' : 'media/picture.jpg'} onCommit={x => put(k, x)} /></Prop>
        {screen.source === 'video' && isHls(v) && <div className="note">An HLS live stream: it needs CORS headers; keep to one or two per scene.</div>}
      </>
    );
    case 'lines': return (
      <Prop name={screen.source === 'terminal' ? 'banner' : 'lines'} wide title={screen.source === 'terminal' ? 'Shown until the first command' : 'Typed out one by one; about 7 fit'}>
        <LinesField label={screen.source === 'terminal' ? 'Banner lines' : 'Lines'} value={v} placeholder="one line per row" onCommit={x => put(k, x)} />
      </Prop>
    );
    case 'graph': return <Prop name="kind"><Seg label="Graph kind" value={v ?? 'wave'} options={GRAPH_KINDS.map(g => [g, g])} onChange={x => put(k, x === 'wave' ? undefined : x)} /></Prop>;
    case 'values': return (screen.graph ?? 'wave') === 'radar' ? null : (
      <Prop name="values" title={screen.graph === 'bars' ? 'One bar each' : 'The series (its last 120 points)'}><ListField numbers label="Values" value={v} placeholder="demo data; e.g. 3, 7, 4" onCommit={x => put(k, x)} /></Prop>
    );
    case 'points': return screen.graph !== 'radar' ? null : (
      <Prop name="blips" wide title="Angle in degrees clockwise from the top, distance from the centre 0–1">
        <RowsField label="Blip" value={v} max={64} add="Blip" blank={{ angle: 0, distance: 0.5 }} onCommit={x => put(k, x)} columns={[
          { key: 'angle', kind: 'number', placeholder: '°', width: '56px' },
          { key: 'distance', kind: 'number', placeholder: '0–1', width: '56px' },
          { key: 'label', placeholder: 'label' },
        ]} />
      </Prop>
    );
    case 'min': case 'max': return (screen.graph ?? 'wave') === 'radar' ? null : (
      <Prop name={k} title="The range the values are drawn in; default the data's own"><NumberField label={k} value={v} optional placeholder="auto" onCommit={x => put(k, x)} /></Prop>
    );
    case 'readout': return <Prop name="readout" title="Title-bar text instead of the computed one"><TextField label="Readout" value={v == null ? '' : String(v)} optional placeholder="computed" onCommit={x => put(k, x)} /></Prop>;
    case 'stats': return (
      <Prop name="numbers" wide title="Up to 8; a delta starting with + shows ▲, with - ▼">
        <RowsField label="Number" value={v} max={8} add="Number" blank={{ value: '0', label: 'LABEL' }} onCommit={x => put(k, x)} columns={[
          { key: 'value', placeholder: 'value', width: '64px' },
          { key: 'label', placeholder: 'label' },
          { key: 'unit', placeholder: 'unit', width: '44px' },
          { key: 'delta', placeholder: '±', width: '48px' },
        ]} />
      </Prop>
    );
    case 'prompt': return <Prop name="prompt"><TextField label="Prompt" value={v ?? ''} optional placeholder="> " onCommit={x => put(k, x)} /></Prop>;
    case 'commands': {
      const rows = Object.entries(v ?? {}).map(([name, reply]) => ({ name, reply }));
      const write = list => {
        const out = {};
        for (const r of list ?? []) if (r.name) out[r.name.toLowerCase()] = r.reply ?? '';
        put(k, Object.keys(out).length ? out : undefined);
      };
      return (
        <Prop name="commands" wide title="Built in: help, clear, goto <n|id>, exit">
          <RowsField label="Command" value={rows} add="Command" blank={{ name: `cmd${rows.length + 1}`, reply: 'OK' }} onCommit={write} columns={[
            { key: 'name', placeholder: 'name', width: '76px' },
            { key: 'reply', kind: 'lines', placeholder: 'reply, one line per row' },
          ]} />
        </Prop>
      );
    }
    case 'rows': return (
      <Prop name="rows" wide title="Flat records; a feed usually fills them">
        <JsonField label="Rows" rows={4} value={v} placeholder='[{ "node": "a", "load": 42 }]' onCommit={x => put(k, x)} />
        {Array.isArray(v) && <span className="aside">{v.length} rows</span>}
      </Prop>
    );
    case 'columns': return <Prop name="columns" title="Fields to show, in order; default the first row's"><ListField label="Columns" value={v} placeholder={fields().join(', ') || 'all'} onCommit={x => put(k, x)} /></Prop>;
    case 'filters': {
      const known = fields();
      if (!known.length) return <Prop name="filters" title="Fields that get a chip group"><ListField label="Filters" value={v} placeholder="e.g. region, status" onCommit={x => put(k, x)} /></Prop>;
      const on = new Set(v ?? []);
      const toggle = f => { const next = known.filter(x => (x === f ? !on.has(x) : on.has(x))); put(k, next.length ? next : undefined); };
      return (
        <Prop name="filters" title="Fields that get a chip group (All + each value)">
          <span className="chips">{known.map(f => <label key={f}><input type="checkbox" checked={on.has(f)} onChange={() => toggle(f)} />{f}</label>)}</span>
        </Prop>
      );
    }
    case 'value': return (
      <Prop name="bar" title="A numeric field drawn as a bar">
        <select aria-label="Bar field" value={v ?? ''} onChange={e => put(k, e.target.value || undefined)}>
          <option value="">none</option>
          {[...new Set([...fields(), ...(v ? [v] : [])])].map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </Prop>
    );
    case 'form': {
      const form = v ?? {};
      const putForm = (fk, x) => { const { [fk]: _old, ...rest } = form; const next = x === undefined ? rest : { ...form, [fk]: x }; put(k, Object.keys(next).length ? next : undefined); };
      return (
        <>
          <Prop name="fields" wide>
            <RowsField label="Field" value={form.fields} add="Field" blank={{ name: `field${(form.fields?.length ?? 0) + 1}` }} onCommit={x => putForm('fields', x)} columns={[
              { key: 'name', placeholder: 'name', width: '70px' },
              { key: 'label', placeholder: 'label' },
              { key: 'type', kind: 'select', options: FORM_TYPES.map(t => [t === 'text' ? '' : t, t]), width: '76px' },
              { key: 'required', kind: 'check', placeholder: 'required', width: '18px' },
            ]} />
          </Prop>
          <Prop name="button"><TextField label="Submit button" value={form.submit ?? ''} optional placeholder="Send" onCommit={x => putForm('submit', x)} /></Prop>
          <Prop name="sends to" title="Where the answers are posted; without it they stay in the browser"><TextField label="Form action" value={form.action ?? ''} optional placeholder="nowhere (a demo)" onCommit={x => putForm('action', x)} /></Prop>
          {form.fields?.some(f => f.autocomplete && !AUTOCOMPLETE.includes(f.autocomplete)) && <Bad msg="A field asks for an autocomplete value that is not allowed." />}
        </>
      );
    }
    default: return null;
  }
}

/** The live-data part: off, polled, streamed or both, and the transform that shapes the answers. */
function FeedFields({ feed, put, transforms }) {
  const f = typeof feed === 'string' ? { url: feed } : feed ?? null;
  const mode = !f ? 'off' : f.url && f.stream ? 'both' : f.stream ? 'stream' : 'url';
  const write = next => {
    const clean = Object.fromEntries(Object.entries(next).filter(([, x]) => x !== undefined && x !== ''));
    put('feed', !Object.keys(clean).length ? undefined : Object.keys(clean).length === 1 && clean.url && typeof feed !== 'object' ? clean.url : clean);
  };
  const setMode = m => {
    if (m === 'off') return put('feed', undefined);
    const base = f ?? {};
    write({ ...base, url: m === 'stream' ? undefined : base.url || 'data/feed.json', stream: m === 'url' ? undefined : base.stream || 'https://' });
  };
  return (
    <>
      <Prop name="source">
        <Seg label="Live data" value={mode} onChange={setMode} options={[['off', 'off'], ['url', 'fetch'], ['stream', 'stream'], ['both', 'both']]} />
      </Prop>
      {f && mode !== 'stream' && <Prop name="url" title="JSON, fetched when the screen appears"><TextField label="Feed URL" value={f.url ?? ''} placeholder="data/feed.json" onCommit={x => write({ ...f, url: x })} /></Prop>}
      {f && mode !== 'stream' && <Prop name="every" title="Fetched again every so many seconds; empty: once"><NumberField label="Refresh seconds" value={f.refresh} optional min={1} placeholder="once" onCommit={x => write({ ...f, refresh: x })} /><span className="aside">s</span></Prop>}
      {f && mode !== 'url' && <Prop name="stream" title="Server-Sent Events; each message replaces the last"><TextField label="Stream URL" value={f.stream ?? ''} placeholder="https://…/events" onCommit={x => write({ ...f, stream: x })} /></Prop>}
      {f && (
        <Prop name="transform" title="A function from scene.json › transforms that turns the answer into the screen's keys">
          <select aria-label="Transform" value={f.transform ?? ''} onChange={e => write({ ...f, transform: e.target.value || undefined })}>
            <option value="">none: the answer is the screen&apos;s keys</option>
            {[...new Set([...transforms, ...(f.transform ? [f.transform] : [])])].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Prop>
      )}
      {f && <div className="note">What is set above shows until the first answer; then the feed&apos;s values replace it.{!transforms.length && ' Transforms are declared in scene.json › transforms.'}</div>}
    </>
  );
}

/** Everything about one screen. */
function ScreenForm({ slot, objKey, entry, obj, edit, files, tree, screens }) {
  const screen = slot.screen ?? {};
  const source = SOURCES[screen.source] ? screen.source : 'rain';
  const info = SOURCES[source];
  const issues = screenIssues(slot.screen);
  const put = (k, v) => edit(f => setScreenKey(f, objKey, entry, slot, k, v));
  const action = slot.hotspot ? obj.actions?.[slot.hotspot] : undefined;
  const scenery = inScenery(objKey);
  const ownZoomOff = entry.schema.shape?.zoom && fullProps(entry, obj.props).zoom === false;
  // a bare zoom action is the default click spelled out (needed in the scenery, where screens do not zoom by themselves)
  const click = action && !(action.type === 'zoom' && !action.screen) ? action : action ? 'zoom' : screen.zoom === false ? 'none' : 'zoom';
  const onClick = c => edit(f => setClick(f, objKey, entry, slot, c === 'zoom' && scenery ? { type: 'zoom' } : c));
  const changeSource = s => {
    const lost = droppedBy(slot.screen, s);
    edit(f => setSource(f, objKey, entry, slot, s), { note: lost.length ? `Removed ${lost.join(', ')}, which ${SOURCES[s].label.toLowerCase()} screens do not use (⌘Z brings them back).` : undefined });
  };
  const shown = new Set(['source', 'id', 'zoom', 'feed', ...info.keys]);
  const stray = Object.keys(issues).filter(k => !shown.has(k));

  return (
    <div className="screen-form">
      <div className="sect">Shows</div>
      <div className="sources" role="radiogroup" aria-label="What the screen shows">
        {Object.entries(SOURCES).map(([s, i]) => (
          <button key={s} type="button" role="radio" aria-checked={s === source} title={i.blurb} className={s === source ? 'on' : ''} onClick={() => s !== source && changeSource(s)}>
            <span className="ico" aria-hidden="true">{i.glyph}</span>{i.label}
          </button>
        ))}
      </div>
      <div className="note blurb">{info.blurb}.</div>
      {info.keys.map(k => <div key={k}><ScreenKey k={k} screen={screen} put={put} /><Bad msg={issues[k]} /></div>)}

      <div className="sect">Live data</div>
      <FeedFields feed={screen.feed} put={put} transforms={transformNames(files)} />
      <Bad msg={issues.feed} />

      <div className="sect">On click</div>
      {slot.hotspot ? (
        <ActionPicker label="does" value={click} self={slot.hotspot} stops={tree.stops} screens={screens} onChange={onClick}
          base={[['zoom', scenery ? 'Zoom in' : 'Zoom in (default)'], ['none', 'Nothing']]} />
      ) : (
        <Prop name="zoom"><input type="checkbox" aria-label="Visitors can zoom in" checked={screen.zoom !== false} onChange={e => put('zoom', e.target.checked ? undefined : false)} /><span className="aside">visitors can zoom in</span></Prop>
      )}
      {scenery && click === 'zoom' && !action && <div className="note warn">In the scenery a screen zooms only with this set explicitly: choose Zoom in again, or make the object a stop.</div>}
      {ownZoomOff && <div className="note warn">The object&apos;s own <code>zoom</code> is off, so the default click does nothing.</div>}
      {info.interactive && click !== 'zoom' && <div className="note warn">Visitors use a {info.label.toLowerCase()} once zoomed in; with another click they cannot reach it.</div>}

      {slot.byId && (
        <>
          <div className="sect">Name</div>
          <Prop name="id" title="What actions and zoom links call the screen; also keeps what visitors typed into it">
            <TextField label="Screen id" value={screen.id ?? ''} optional placeholder={slot.fallback ?? ''} onCommit={x => edit(f => setScreenId(f, objKey, entry, slot, x))} />
          </Prop>
          <Bad msg={issues.id} />
        </>
      )}
      {stray.map(k => <Bad key={k} msg={`${k}: ${issues[k]}`} />)}
    </div>
  );
}

/** A sketch of a wall of screens, laid out as the prefab lays them out (left to right, top row first). */
function Wall({ slots, columns, at, onPick, actions }) {
  return (
    <div className="wall" role="listbox" aria-label="Screens" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(columns, slots.length || 1))}, 1fr)` }}>
      {slots.map((s, i) => {
        const sc = s.screen ?? {};
        const bad = Object.keys(screenIssues(s.screen)).length > 0;
        return (
          <button key={i} type="button" role="option" aria-selected={i === at} className={`tile${i === at ? ' on' : ''}${bad ? ' bad' : ''}`} onClick={() => onPick(i)}
            title={`${s.hotspot ?? ''} · ${SOURCES[sc.source ?? 'rain']?.label ?? sc.source}`} style={sc.color ? { '--tile': sc.color } : undefined}>
            <span className="ico" aria-hidden="true">{SOURCES[sc.source ?? 'rain']?.glyph ?? '?'}</span>
            <span className="cap">{captionOf(sc)}</span>
            <span className="badges" aria-hidden="true">
              {sc.feed && <span title="live data">⟳</span>}
              {sc.source === 'video' && <span title="playback is shared with everyone in an event">⇄</span>}
              {s.hotspot && actions?.[s.hotspot] && <span title="click runs an action">↗</span>}
              {sc.zoom === false && <span title="not clickable">⊘</span>}
              {bad && <span title="has a problem">!</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The screens of one prop: the wall and its buttons for a list, then the form of the chosen screen. */
function ScreenProp({ field, kind, slots, objKey, entry, obj, edit, files, tree, screens }) {
  const part = useStore(s => s.edit?.part);
  const setPart = p => useStore.getState().setEdit({ part: p });
  const found = slots.findIndex(s => s.hotspot != null && s.hotspot === part);
  const at = found >= 0 ? found : Math.min(slots.length - 1, 0);
  // the screen the form shows is the one outlined in the room
  const shownPart = slots[at]?.hotspot ?? null;
  useEffect(() => { if (found < 0 && shownPart != null) setPart(shownPart); }, [found, shownPart]);
  if (kind === 'screen') {
    const slot = slots[0];
    if (!slot.screen) {
      return (
        <div className="screens">
          <div className="sect">Screen</div>
          <div className="note">Shows <code>{String(fullProps(entry, obj.props).source ?? 'rain')}</code> from the props above. A full set-up adds titles, live data, interactive screens and a click of its own.</div>
          <div className="row"><button type="button" className="btn ghost" onClick={() => edit(f => startScreen(f, objKey, entry, field))}>Set up the screen</button></div>
        </div>
      );
    }
    return <div className="screens"><div className="sect">Screen <code>{field}</code></div><ScreenForm slot={slot} objKey={objKey} entry={entry} obj={obj} edit={edit} files={files} tree={tree} screens={screens} /></div>;
  }
  const props = fullProps(entry, obj.props);
  const pick = i => setPart(slots[i]?.hotspot ?? null);
  // after a change to the list, the screen at `i` of the new list is the one shown (its name may be new: scr6)
  const after = (fn, i) => {
    let next = null;
    edit(f => { const out = fn(f); next = screenSlots(entry, objectAt(out, objKey)).filter(s => s.field === field)[i]?.hotspot ?? null; return out; }, { then: () => setPart(next) });
  };
  const slot = slots[at];
  return (
    <div className="screens">
      <div className="sect">Screens <span className="aside">{slots.length} · click one, or one in the room in Select mode</span></div>
      <Wall slots={slots} columns={typeof props.columns === 'number' ? props.columns : 3} at={at} onPick={pick} actions={obj.actions} />
      <div className="row wall-tools">
        <button type="button" className="btn ghost small" onClick={() => after(f => addScreen(f, objKey, entry, field, -1), slots.length)}>+ Screen</button>
        <button type="button" className="btn ghost small" disabled={!slot} onClick={() => after(f => addScreen(f, objKey, entry, field, at + 1, slot.screen ?? {}), at + 1)}>Duplicate</button>
        <button type="button" className="btn ghost small" disabled={!slot || at === 0} aria-label="Move the screen left" title="Earlier in the list: left, or up a row" onClick={() => after(f => moveScreen(f, objKey, entry, field, at, at - 1), at - 1)}>◀</button>
        <button type="button" className="btn ghost small" disabled={!slot || at === slots.length - 1} aria-label="Move the screen right" title="Later in the list" onClick={() => after(f => moveScreen(f, objKey, entry, field, at, at + 1), at + 1)}>▶</button>
        <button type="button" className="btn ghost small danger" disabled={!slot} onClick={() => after(f => removeScreen(f, objKey, entry, field, at), Math.max(0, at - 1))}>Remove</button>
      </div>
      {slot ? <ScreenForm key={at} slot={slot} objKey={objKey} entry={entry} obj={obj} edit={edit} files={files} tree={tree} screens={screens} /> : <div className="note">No screens: add one.</div>}
    </div>
  );
}

/**
 * The props the generic form leaves out: those holding screens (this editor's), and the older `source` / `src` of a
 * cinema screen or desk while a full screen config is written and they are not (the config replaces them).
 */
export function screenProps(entry, obj) {
  const shape = entry.schema.shape ?? {};
  const out = new Set(Object.entries(shape).filter(([, s]) => screenKind(s)).map(([k]) => k));
  const full = [...out].some(k => screenKind(shape[k]).kind === 'screen' && obj.props?.[k] && typeof obj.props[k] === 'object');
  if (full) for (const k of ['source', 'src']) if (shape[k] && obj.props?.[k] === undefined) out.add(k);
  return out;
}

/** The screen editors of an object, then the actions of its other clickable parts. */
export function ScreenEditor({ objKey, obj, entry, edit, files, tree, registry }) {
  const slots = screenSlots(entry, obj);
  const screens = useScreenIds(files, tree, registry);
  const fields = [...new Set(slots.map(s => s.field))];
  return fields.map(field => {
    const own = slots.filter(s => s.field === field);
    const kind = own[0]?.index == null && screenKind(entry.schema.shape[field]).kind === 'screen' ? 'screen' : 'screens';
    return <ScreenProp key={field} field={field} kind={kind} slots={own} objKey={objKey} entry={entry} obj={obj} edit={edit} files={files} tree={tree} screens={screens} />;
  });
}

/** The actions of the object's clickable parts that are not screens (a desk's chair, a door, a picture frame). */
export function PartActions({ objKey, obj, entry, edit, files, tree, registry }) {
  const screens = useScreenIds(files, tree, registry);
  const taken = new Set(screenSlots(entry, obj).map(s => s.hotspot));
  const parts = hotspotNames(entry, obj).filter(h => !taken.has(h));
  const known = new Set([...parts, ...taken]);
  const stray = Object.keys(obj.actions ?? {}).filter(h => !known.has(h));
  if (!parts.length && !stray.length) return null;
  return (
    <div className="parts">
      <div className="sect">{taken.size ? 'Other clickable parts' : 'On click'}</div>
      {parts.map(h => (
        <ActionPicker key={h} label={h} value={obj.actions?.[h] ?? 'none'} base={[['none', 'Nothing']]} stops={tree.stops} screens={screens}
          onChange={a => edit(f => setAction(f, objKey, h, typeof a === 'object' ? a : null))} />
      ))}
      {stray.map(h => <Bad key={h} msg={`An action is bound to "${h}", which this object does not have: remove it in JSON.`} />)}
    </div>
  );
}
