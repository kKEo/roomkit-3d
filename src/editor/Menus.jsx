import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * The tree's right-click menu. `items` are `{ label, hint?, onClick, disabled?, danger? }`, `'-'` for a separator
 * and `{ heading }` for a group title. ↑ ↓ move, Enter picks, Esc or a click elsewhere closes.
 */
export function ContextMenu({ x, y, items, onClose }) {
  const box = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const r = box.current.getBoundingClientRect();
    setPos({ left: Math.min(x, innerWidth - r.width - 8), top: Math.min(y, innerHeight - r.height - 8) });
    box.current.querySelector('button:not(:disabled)')?.focus();
  }, [x, y]);
  useEffect(() => {
    const away = e => { if (!box.current?.contains(e.target)) onClose(); };
    addEventListener('pointerdown', away, true);
    return () => removeEventListener('pointerdown', away, true);
  }, [onClose]);
  const onKeyDown = e => {
    e.stopPropagation();
    const btns = [...box.current.querySelectorAll('button:not(:disabled)')];
    const i = btns.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length]?.focus(); }
  };
  return (
    <div className="ctx-menu" role="menu" ref={box} style={pos} onKeyDown={onKeyDown}>
      {items.map((it, i) => {
        if (it === '-') return <hr key={i} />;
        if (it.heading) return <div key={i} className="heading">{it.heading}</div>;
        return (
          <button key={i} type="button" role="menuitem" disabled={it.disabled} className={it.danger ? 'danger' : undefined}
            onClick={() => { onClose(); it.onClick(); }}>
            <span>{it.label}</span>{it.hint && <kbd>{it.hint}</kbd>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A question over the editor pane before a change that removes something: `lines` say what will happen,
 * `actions` are `{ label, onClick?, primary?, danger? }` (one without `onClick` just closes). Esc cancels.
 */
export function ConfirmBox({ title, lines, actions, onClose }) {
  const box = useRef(null);
  useEffect(() => { box.current?.querySelector('.primary')?.focus(); }, []);
  return (
    <div className="editor-ask" role="alertdialog" aria-modal="true" aria-labelledby="ask-title"
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}>
      <div className="box" ref={box}>
        <h2 id="ask-title">{title}</h2>
        <ul>{lines.map((l, i) => <li key={i} className={l.startsWith('  ') ? 'ref' : undefined}>{l.trim()}</li>)}</ul>
        <div className="row">
          {actions.map(a => (
            <button key={a.label} type="button" className={`btn${a.primary ? ' primary' : ' ghost'}${a.danger ? ' danger' : ''}`}
              onClick={() => { onClose(); a.onClick?.(); }}>{a.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
