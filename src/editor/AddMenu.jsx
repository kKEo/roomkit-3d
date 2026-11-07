import { useMemo, useState } from 'react';
import { glyphOf, blurbOf } from './types.js';

/**
 * The Add palette: every prefab type the scene can use, built-ins and the scene's own, filtered as you type.
 * ↑ ↓ choose, Enter adds, Esc closes. What is added always starts as scenery, where the camera looks.
 */
export function AddMenu({ registry, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const groups = useMemo(() => {
    const own = new Set(Object.keys(registry.extra));
    const hit = t => !q || t.toLowerCase().includes(q.toLowerCase()) || blurbOf(t).includes(q.toLowerCase());
    const types = registry.types().filter(hit);
    return [['Built-in', types.filter(t => !own.has(t))], ["This scene's own", types.filter(t => own.has(t))]].filter(([, ts]) => ts.length);
  }, [registry, q]);
  const flat = groups.flatMap(([, ts]) => ts);
  const pick = t => { if (t) onPick(t); };

  const onKeyDown = e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setAt(i => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(flat[at]); }
  };

  return (
    <div className="add-menu" role="dialog" aria-label="Add an object" onKeyDown={onKeyDown}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) onClose(); }}>
      <input autoFocus value={q} placeholder="Find a type…" aria-label="Find a type" aria-controls="add-list"
        aria-activedescendant={flat[at] ? `add-${flat[at]}` : undefined}
        onChange={e => { setQ(e.target.value); setAt(0); }} />
      <ul id="add-list" role="listbox">
        {groups.map(([title, ts]) => (
          <li key={title} role="presentation">
            <div className="group">{title}</div>
            <ul role="presentation">
              {ts.map(t => (
                <li key={t} id={`add-${t}`} role="option" aria-selected={flat[at] === t} className={flat[at] === t ? 'on' : ''}
                  onMouseEnter={() => setAt(flat.indexOf(t))} onMouseDown={e => e.preventDefault()} onClick={() => pick(t)}>
                  <span className="ico" aria-hidden="true">{glyphOf(t)}</span>
                  <span className="lbl">{t}</span>
                  <span className="sub">{blurbOf(t)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
        {!flat.length && <li className="sub">No type matches.</li>}
      </ul>
      <div className="note">Lands in the scenery where the camera looks. Make it a stop afterwards if visitors should stop at it.</div>
    </div>
  );
}
