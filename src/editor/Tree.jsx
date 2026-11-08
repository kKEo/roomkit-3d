import { useEffect, useMemo, useRef, useState } from 'react';
import { glyphOf } from './types.js';

/**
 * The scene tree: the room, the scenery and the stops with their objects (see tree.js). Keyboard as in the
 * WAI-ARIA tree pattern (↑ ↓ ← → Home End, type-ahead), plus Enter or F to fly to a node, F2 to rename, Delete,
 * ⌘/Ctrl+D to duplicate, Alt+↑ ↓ to move, H to hide. Rows drag onto the scenery, a stop or between rows; a drop
 * that cannot be done says why. Keys never reach the room while the tree has focus.
 */

const pad = n => String(n + 1).padStart(2, '0');

/** `t:desk lamp` → { type: 'desk', text: 'lamp' }. */
function parseFilter(q) {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const t = words.find(w => w.startsWith('t:'));
  return { type: t ? t.slice(2) : '', text: words.filter(w => w !== t).join(' ') };
}

/** The visible rows, in order. A filter keeps the stops of matching objects (and stops whose label matches) visible. */
function rowsOf(tree, expanded, filter) {
  const q = parseFilter(filter);
  const filtering = !!(q.type || q.text);
  const match = n => (!q.type || n.type.toLowerCase().startsWith(q.type)) && (!q.text || `${n.label} ${n.type}`.toLowerCase().includes(q.text));
  const rows = [{ key: 'room', depth: 0, kind: 'room', label: tree.title || 'Room', parent: null }];
  const sceneryOpen = filtering || expanded.has('scenery');
  rows.push({ key: 'scenery', depth: 0, kind: 'group', label: 'Scenery', count: tree.decor.length, open: sceneryOpen, parent: null });
  if (sceneryOpen) for (const n of filtering ? tree.decor.filter(match) : tree.decor) rows.push({ ...n, depth: 1, kind: 'object', parent: 'scenery' });
  const stopsOpen = filtering || expanded.has('stops');
  rows.push({ key: 'stops', depth: 0, kind: 'group', label: 'Stops', count: tree.stops.length, open: stopsOpen, parent: null });
  if (stopsOpen) {
    for (const s of tree.stops) {
      const labelHit = !q.type && q.text && s.label.toLowerCase().includes(q.text);
      const objs = !filtering || labelHit ? s.objects : s.objects.filter(match);
      if (filtering && !objs.length && !labelHit) continue;
      const open = (filtering && objs.length > 0) || expanded.has(s.key);
      rows.push({ ...s, depth: 1, kind: 'stop', open, parent: 'stops', expandable: s.objects.length > 0 });
      if (open) for (const n of objs) rows.push({ ...n, depth: 2, kind: 'object', parent: s.key });
    }
  }
  return rows;
}

/** Where a dragged row may land on `row`: `{ where: 'into' | 'before' | 'after', bad?: why not }`, or null for no change. */
function dropRule(drag, row, lower) {
  if (!drag || drag.key === row.key) return null;
  const side = lower ? 'after' : 'before';
  if (drag.kind === 'object') {
    if (row.key === 'scenery' || row.kind === 'stop') return { where: 'into' };
    if (row.kind === 'object') return { where: side };
    return { where: 'into', bad: row.key === 'stops' ? 'Drop it on a stop to add it there, or use "Make it a stop".' : 'Objects go into the scenery or a stop.' };
  }
  if (row.kind === 'stop') return { where: side };
  if (row.key === 'stops') return { where: 'into' };
  if (row.key === 'scenery') return { where: 'into' };
  return { where: 'into', bad: row.kind === 'object' ? 'Stops cannot go inside other stops. Drop it on Scenery to turn it into scenery.' : 'Stops are reordered within Stops.' };
}

function Toggle({ on, label, glyph, onClick, mixed }) {
  return (
    <button type="button" className={`tog${on ? ' on' : ''}${mixed ? ' mixed' : ''}`} aria-pressed={on} aria-label={label} title={label}
      tabIndex={-1} onClick={e => { e.stopPropagation(); onClick(); }}>{glyph}</button>
  );
}

export function Tree({
  tree, errors, selected, hovered, current, hidden, locked, expanded, setExpanded, filter, renaming, setRenaming, registry,
  onSelect, onActivate, onHover, onRename, onMenu, onDrop, onReject, onDelete, onDuplicate, onStep, onHide, onLock,
}) {
  const rows = useMemo(() => rowsOf(tree, expanded, filter), [tree, expanded, filter]);
  const [focus, setFocus] = useState(selected ?? 'room');
  const [hint, setHint] = useState(null); // { key, where, bad }
  const drag = useRef(null);
  const typed = useRef({ text: '', at: 0 });
  const box = useRef(null);

  // the selection made elsewhere (the room, an operation) becomes the focused row, scrolled into view
  useEffect(() => { if (selected) setFocus(selected); }, [selected]);
  // roving focus: the focused row is the one Tab reaches, and it takes the keyboard focus while the tree has it
  const focusKey = rows.some(r => r.key === focus) ? focus : rows[0]?.key;
  useEffect(() => {
    const el = box.current?.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
    if (!renaming && box.current.contains(document.activeElement) && document.activeElement !== el) el.focus();
  }, [focusKey, rows, renaming]);

  const errCount = key => errors.get(key)?.length ?? 0;
  const countFor = row => {
    if (row.kind === 'object' || row.kind === 'room') return errCount(row.key);
    if (row.kind === 'stop') return errCount(row.key) + row.objects.reduce((n, o) => n + errCount(o.key), 0);
    if (row.key === 'scenery') return tree.decor.reduce((n, o) => n + errCount(o.key), 0);
    return tree.stops.reduce((n, s) => n + errCount(s.key) + s.objects.reduce((m, o) => m + errCount(o.key), 0), 0);
  };
  const keysOf = row => (row.kind === 'object' ? [row.key] : row.kind === 'stop' ? row.objects.map(o => o.key) : row.key === 'scenery' ? tree.decor.map(o => o.key) : []);
  const allIn = (set, keys) => keys.length > 0 && keys.every(k => set.has(k));
  const someIn = (set, keys) => keys.some(k => set.has(k));

  const toggleOpen = (key, open) => setExpanded(prev => {
    const next = new Set(prev);
    if (open ?? !next.has(key)) next.add(key); else next.delete(key);
    return next;
  });
  const go = key => { setFocus(key); onSelect(key); };

  const onKeyDown = e => {
    if (renaming || ((e.metaKey || e.ctrlKey) && /^[zy]$/i.test(e.key))) return; // undo and redo are the page's
    e.stopPropagation(); // the room's keys (arrows, numbers, H, M) stay out of the tree
    const i = Math.max(0, rows.findIndex(r => r.key === focusKey));
    const row = rows[i];
    if (!row) return;
    const mod = e.metaKey || e.ctrlKey;
    const handled = () => e.preventDefault();
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { handled(); onStep(row, e.key === 'ArrowUp' ? -1 : 1); return; }
    switch (e.key) {
      case 'ArrowDown': handled(); if (rows[i + 1]) go(rows[i + 1].key); return;
      case 'ArrowUp': handled(); if (rows[i - 1]) go(rows[i - 1].key); return;
      case 'Home': handled(); go(rows[0].key); return;
      case 'End': handled(); go(rows[rows.length - 1].key); return;
      case 'ArrowRight':
        handled();
        if ((row.kind === 'group' || row.expandable) && !row.open) toggleOpen(row.key, true);
        else if (row.open && rows[i + 1]?.parent === row.key) go(rows[i + 1].key);
        return;
      case 'ArrowLeft':
        handled();
        if (row.open && !filter) toggleOpen(row.key, false);
        else if (row.parent) go(row.parent);
        return;
      case 'Enter': handled(); onActivate(row.key); return;
      case 'F2': handled(); if (row.kind === 'object' || row.kind === 'stop') setRenaming(row.key); return;
      case 'Delete': case 'Backspace': handled(); onDelete(row); return;
      default:
    }
    if (mod && e.key.toLowerCase() === 'd') { handled(); onDuplicate(row); return; }
    if (mod || e.altKey) return;
    if (e.key === 'f' || e.key === 'F') { handled(); onActivate(row.key); return; }
    if (e.key === 'h' || e.key === 'H') { handled(); onHide(keysOf(row)); return; }
    if (e.key.length === 1 && /\S/.test(e.key)) {
      // type-ahead: the next row whose label starts with what was typed in the last half second
      const t = typed.current, now = performance.now();
      t.text = now - t.at < 500 ? t.text + e.key.toLowerCase() : e.key.toLowerCase();
      t.at = now;
      const order = [...rows.slice(i + (t.text.length === 1 ? 1 : 0)), ...rows];
      const hit = order.find(r => r.label.toLowerCase().startsWith(t.text));
      if (hit) go(hit.key);
    }
  };

  const dragOver = (e, row) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rule = dropRule(drag.current, row, e.clientY > rect.top + rect.height / 2);
    if (!rule) { setHint(null); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = rule.bad ? 'none' : 'move';
    if (hint?.key !== row.key || hint.where !== rule.where || hint.bad !== rule.bad) setHint({ key: row.key, ...rule });
  };
  const drop = (e, row) => {
    e.preventDefault();
    const d = drag.current, h = hint;
    drag.current = null;
    setHint(null);
    if (!d || !h || h.key !== row.key) return;
    if (h.bad) onReject(h.bad);
    else onDrop(d, row, h.where);
  };

  return (
    <div className="tree" role="tree" aria-label="Scene objects" ref={box} onKeyDown={onKeyDown}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setHint(null); }}>
      {rows.map(row => {
        const errs = countFor(row);
        const objKeys = keysOf(row);
        const isHidden = allIn(hidden, objKeys), isLocked = allIn(locked, objKeys);
        const cls = ['row', row.kind, row.key === selected && 'sel', row.key === hovered && 'hov', isHidden && 'hidden', errs && 'bad', row.bad && 'bad',
          hint?.key === row.key && `drop-${hint.bad ? 'bad' : hint.where}`].filter(Boolean).join(' ');
        const expandable = row.kind === 'group' || row.expandable;
        return (
          <div key={row.key} data-key={row.key} className={cls} role="treeitem" aria-level={row.depth + 1} aria-selected={row.key === selected}
            aria-expanded={expandable ? !!row.open : undefined} tabIndex={row.key === focusKey ? 0 : -1}
            style={{ paddingLeft: 6 + row.depth * 16 }}
            draggable={(row.kind === 'object' || row.kind === 'stop') && renaming !== row.key}
            onFocus={e => { if (e.target === e.currentTarget && row.key !== focusKey) setFocus(row.key); }}
            onClick={() => { setFocus(row.key); onSelect(row.key, { fly: row.kind === 'stop' }); }}
            onDoubleClick={() => onActivate(row.key)}
            onContextMenu={e => { e.preventDefault(); setFocus(row.key); onSelect(row.key); onMenu(row, e.clientX, e.clientY); }}
            onMouseEnter={() => row.kind !== 'group' && row.kind !== 'room' && onHover(row.key)}
            onMouseLeave={() => onHover(null)}
            onDragStart={e => { drag.current = row; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', row.label); }}
            onDragEnd={() => { drag.current = null; setHint(null); }}
            onDragOver={e => dragOver(e, row)}
            onDrop={e => drop(e, row)}
          >
            <span className="twisty" aria-hidden="true" onClick={e => { if (expandable) { e.stopPropagation(); if (!filter) toggleOpen(row.key); } }}>
              {expandable ? (row.open ? '▾' : '▸') : ''}
            </span>
            <span className="ico" aria-hidden="true">
              {row.kind === 'room' ? '⌂' : row.key === 'scenery' ? '▦' : row.key === 'stops' ? '◆' : row.kind === 'stop' ? pad(row.n) : glyphOf(row.type, registry)}
            </span>
            {renaming === row.key ? (
              <RenameBox initial={row.kind === 'stop' ? row.label : row.name ?? ''} placeholder={row.label}
                onDone={text => { setRenaming(null); if (text != null) onRename(row, text); box.current?.querySelector(`[data-key="${CSS.escape(row.key)}"]`)?.focus(); }} />
            ) : (
              <span className="lbl">{row.label}</span>
            )}
            {row.kind === 'stop' && row.id === current && <span className="here" title="The camera is at this stop">⌖</span>}
            {row.kind === 'object' && row.name && <span className="sub">{row.type}</span>}
            {row.kind === 'group' && <span className="sub">{row.count}</span>}
            {errs > 0 && <span className="err" title={`${errs} problem${errs === 1 ? '' : 's'}`}>⚠ {errs}</span>}
            {row.bad && !errs && <span className="err" title="The file is missing or not valid JSON">⚠</span>}
            {objKeys.length > 0 && (
              <span className="togs">
                <Toggle on={isHidden} mixed={!isHidden && someIn(hidden, objKeys)} glyph={isHidden ? '○' : '●'} label={isHidden ? 'Show in the preview' : 'Hide in the preview (not saved)'} onClick={() => onHide(objKeys)} />
                {row.kind !== 'stop' && <Toggle on={isLocked} mixed={!isLocked && someIn(locked, objKeys)} glyph="⊘" label={isLocked ? 'Unlock: clicks in the room pick it again' : 'Lock: clicks in the room go through it (not saved)'} onClick={() => onLock(objKeys)} />}
              </span>
            )}
          </div>
        );
      })}
      {!tree.ok && <div className="row bad">scene.json is not valid JSON: fix it in Files</div>}
    </div>
  );
}

/** The inline rename field: Enter or leaving it keeps the text, Esc gives up. */
function RenameBox({ initial, placeholder, onDone }) {
  const [text, setText] = useState(initial);
  const done = useRef(false);
  const finish = v => { if (done.current) return; done.current = true; onDone(v); };
  return (
    <input className="rename" autoFocus value={text} placeholder={placeholder} aria-label="New name"
      onChange={e => setText(e.target.value)}
      onFocus={e => e.target.select()}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(text);
        else if (e.key === 'Escape') finish(null);
      }}
      onBlur={() => finish(text)} />
  );
}
