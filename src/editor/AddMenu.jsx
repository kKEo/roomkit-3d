import { useMemo, useState } from 'react';
import { glyphOf, blurbOf, titleOf, isHosted } from './types.js';

/**
 * The Add palette: every prefab type the scene can use, the built-ins, the scene's own (modules in its folder) and
 * those it takes from the web, filtered as you type. ↑ ↓ choose, Enter adds, Esc closes. What is added always
 * starts as scenery, where the camera looks. The last line opens the dialog that adds types from the web.
 */
export function AddMenu({ registry, onPick, onClose, onAddType }) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const groups = useMemo(() => {
    const hit = t => !q || `${t} ${titleOf(t, registry)} ${blurbOf(t, registry)}`.toLowerCase().includes(q.toLowerCase());
    const types = registry.types().filter(hit);
    const kind = t => (!registry.extra[t] ? 'Built-in' : isHosted(registry.extra[t]) ? 'From the web' : "This scene's own");
    return ['Built-in', "This scene's own", 'From the web'].map(g => [g, types.filter(t => kind(t) === g)]).filter(([, ts]) => ts.length);
  }, [registry, q]);
  const flat = groups.flatMap(([, ts]) => ts);
  const pick = t => { if (t) onPick(t); };

  const onKeyDown = e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setAt(i => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); pick(flat[at]); }
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
                  <span className="ico" aria-hidden="true">{glyphOf(t, registry)}</span>
                  <span className="lbl" title={titleOf(t, registry) !== t ? t : undefined}>{titleOf(t, registry)}</span>
                  <span className="sub">{blurbOf(t, registry)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
        {!flat.length && <li className="sub">No type matches.</li>}
      </ul>
      <div className="note">
        Lands in the scenery where the camera looks. Make it a stop afterwards if visitors should stop at it.
        {onAddType && <button type="button" className="link" onClick={onAddType}>+ Add a type from the web…</button>}
      </div>
    </div>
  );
}
