import { useState } from 'react';
import { useStore } from '../../state/store.js';
import { guardData } from '../../config/origins.js';
import { deltaDirection } from './schema.js';

const ARROW = { up: '▲', down: '▼', flat: '•' };

export function Stats({ data }) {
  return (
    <div className="stats" style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }}>
      {data.map((s, i) => {
        const dir = s.delta != null ? deltaDirection(s.delta) : null;
        return (
          <div key={i}>
            <strong>{s.value}{s.unit && <small>{s.unit}</small>}</strong>
            <span>{s.label}</span>
            {dir && <em className={`delta ${dir}`}>{ARROW[dir]} {s.delta}</em>}
          </div>
        );
      })}
    </div>
  );
}

export function Cards({ data }) {
  return (
    <div className="cards">
      {data.map((c, i) => (
        <article key={i}>
          <h3>{c.title}</h3>
          {c.text && <p>{c.text}</p>}
          {c.meta && <small>{c.meta}</small>}
        </article>
      ))}
    </div>
  );
}

export function List({ data }) {
  return (
    <ul className="list">
      {data.map((it, i) => (
        <li key={i}><i>{it.icon ?? '/'}</i><div><strong>{it.title}</strong>{it.text && <span>{it.text}</span>}</div></li>
      ))}
    </ul>
  );
}

export function Timeline({ data }) {
  return (
    <ol className="timeline">
      {data.map((it, i) => <li key={i}><b>{it.title}</b><span>{it.text}</span></li>)}
    </ol>
  );
}

/**
 * { fields: [{ name, label, type, autocomplete }], submit, action? } — POSTs JSON to `action` if given.
 * `action` must be an allowed data origin (`VITE_DATA_ORIGINS`), and nothing but the fields is sent: no cookies.
 */
export function Form({ data }) {
  const ui = useStore(s => s.scene.ui);
  const [status, setStatus] = useState('');
  const fields = data.fields || [];
  const onSubmit = async e => {
    e.preventDefault();
    if (!data.action) { setStatus(ui.formPrototype); return; }
    const form = e.currentTarget; // null after the await, so keep a reference
    const body = Object.fromEntries(new FormData(form));
    try {
      const url = guardData(data.action);
      const res = await fetch(url, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setStatus(res.ok ? ui.formSent : ui.formFailed);
      if (res.ok) form.reset();
    } catch (err) {
      console.warn(`Form ${data.action}: ${err?.message ?? err}`);
      setStatus(ui.formFailed);
    }
  };
  return (
    <form onSubmit={onSubmit}>
      {fields.map(f => (
        <label className="field" key={f.name}>
          <span>{f.label}</span>
          {f.type === 'textarea'
            ? <textarea name={f.name} rows={f.rows || 4} required={f.required} />
            : <input name={f.name} type={f.type || 'text'} autoComplete={f.autocomplete} required={f.required} />}
        </label>
      ))}
      <button type="submit" className="btn">{data.submit || 'Send'}</button>
      <div className="status" role="status">{status}</div>
    </form>
  );
}

export const BLOCKS = { stats: Stats, cards: Cards, list: List, timeline: Timeline, form: Form };
