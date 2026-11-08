import { useEffect, useState } from 'react';

/**
 * The inspector's inputs. Each keeps what is being typed to itself and writes (`onCommit`) when left or on Enter,
 * so half-typed values never reach the scene; `undefined` means "remove the key".
 */

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : '');
export const parseJson = t => { try { return { ok: true, v: JSON.parse(t) }; } catch (e) { return { ok: false, msg: e.message }; } };
const enter = commit => e => { if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') commit(); };

/** A number; empty gives null when `nullable`, `undefined` when `optional`, else goes back to the value. */
export function NumberField({ value, onCommit, nullable = false, optional = false, int = false, min, max, label, width, placeholder }) {
  const [text, setText] = useState(String(num(value)));
  useEffect(() => setText(String(num(value))), [value]);
  const commit = () => {
    if (text.trim() === '') { if (nullable) onCommit(null); else if (optional) { if (value !== undefined) onCommit(undefined); } else setText(String(num(value))); return; }
    const v = Number(text);
    if (!Number.isFinite(v) || (int && !Number.isInteger(v)) || (min != null && v < min) || (max != null && v > max)) { setText(String(num(value))); return; }
    if (v !== value) onCommit(v);
  };
  return (
    <input className="num" inputMode="decimal" aria-label={label} value={text} placeholder={placeholder ?? (nullable ? 'none' : '')} style={width ? { width } : undefined}
      onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={enter(commit)} />
  );
}

/** Text; empty gives null when `nullable`, `undefined` when `optional`. */
export function TextField({ value, onCommit, placeholder, label, nullable = false, optional = false, list }) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  const commit = () => {
    const v = text === '' && nullable ? null : text === '' && optional ? undefined : text;
    if (v !== (value ?? (nullable ? null : optional ? undefined : ''))) onCommit(v);
  };
  return <input className="text" aria-label={label} value={text} placeholder={placeholder} list={list} onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={enter(commit)} />;
}

/** JSON text for a nested setting; written when valid and left. */
export function JsonField({ value, onCommit, label, rows = 3, placeholder }) {
  const shown = value === undefined ? '' : JSON.stringify(value, null, 1).replace(/\n\s*/g, ' ');
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(null);
  useEffect(() => { setText(shown); setBad(null); }, [shown]);
  const commit = () => {
    if (text === shown) return;
    if (text.trim() === '') { setBad(null); onCommit(undefined); return; }
    const r = parseJson(text);
    if (!r.ok) { setBad(r.msg); return; }
    setBad(null);
    onCommit(r.v);
  };
  return (
    <>
      <textarea className="json" rows={rows} aria-label={label} value={text} placeholder={placeholder} spellCheck={false} onChange={e => setText(e.target.value)} onBlur={commit} />
      {bad && <div className="bad">{bad}</div>}
    </>
  );
}

/** One string per line (a text screen's lines, a terminal's banner); no lines removes the key. */
export function LinesField({ value, onCommit, label, rows = 4, placeholder }) {
  const shown = Array.isArray(value) ? value.join('\n') : value == null ? '' : String(value);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const commit = () => { if (text !== shown) onCommit(text.trim() === '' ? undefined : text.replace(/\n+$/, '').split('\n')); };
  return <textarea className="json lines" rows={rows} aria-label={label} value={text} placeholder={placeholder} spellCheck={false} onChange={e => setText(e.target.value)} onBlur={commit} />;
}

/** A comma-separated list of words or numbers (`numbers`); empty removes the key. */
export function ListField({ value, onCommit, label, placeholder, numbers = false }) {
  const shown = Array.isArray(value) ? value.join(', ') : '';
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(null);
  useEffect(() => { setText(shown); setBad(null); }, [shown]);
  const commit = () => {
    if (text === shown) return;
    const parts = text.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    if (numbers && parts.some(p => !Number.isFinite(Number(p)))) { setBad('numbers only, separated by commas'); return; }
    setBad(null);
    onCommit(parts.length ? (numbers ? parts.map(Number) : parts) : undefined);
  };
  return (
    <>
      <input className="text" aria-label={label} value={text} placeholder={placeholder} onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={enter(commit)} />
      {bad && <div className="bad">{bad}</div>}
    </>
  );
}

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;
const toHex6 = v => (HEX6.test(v ?? '') ? v : HEX3.test(v ?? '') ? `#${[...v.slice(1)].map(c => c + c).join('')}` : null);

/** A CSS colour: a swatch to pick from and the text (any colour the schema takes); empty removes it. */
export function ColorField({ value, onCommit, label, placeholder }) {
  return (
    <span className="color">
      <input type="color" aria-label={`${label}: pick`} value={toHex6(value) ?? toHex6(placeholder) ?? '#00ff66'} onChange={e => onCommit(e.target.value)} />
      <TextField label={label} value={value ?? ''} optional placeholder={placeholder ?? 'theme accent'} onCommit={onCommit} />
    </span>
  );
}

/** A row of buttons for a few choices. */
export function Seg({ value, options, onChange, label }) {
  return (
    <span className="seg" role="group" aria-label={label}>
      {options.map(([v, text, title]) => (
        <button key={String(v)} type="button" aria-pressed={value === v} title={title} onClick={() => value !== v && onChange(v)}>{text}</button>
      ))}
    </span>
  );
}

/**
 * A short list of records edited as a table (a stats screen's numbers, a form's fields, a terminal's commands).
 * `columns`: `{ key, kind: 'text' | 'number' | 'select' | 'check' | 'lines', options?, placeholder?, width? }`. An empty
 * cell removes its key; no rows removes the whole list.
 */
export function RowsField({ value, columns, onCommit, label, max = Infinity, add = 'Add', blank = {} }) {
  const rows = Array.isArray(value) ? value : [];
  const write = next => onCommit(next.length ? next : undefined);
  const setCell = (i, key, v) => write(rows.map((r, j) => {
    if (j !== i) return r;
    const { [key]: _old, ...rest } = r;
    return v === undefined || v === '' ? rest : { ...r, [key]: v };
  }));
  const cell = (r, i, c) => {
    const l = `${label} ${i + 1} ${c.key}`;
    if (c.kind === 'number') return <NumberField label={l} value={r[c.key]} optional placeholder={c.placeholder} width={c.width} onCommit={v => setCell(i, c.key, v)} />;
    if (c.kind === 'check') return <input type="checkbox" aria-label={l} title={c.placeholder} checked={!!r[c.key]} onChange={e => setCell(i, c.key, e.target.checked || undefined)} />;
    if (c.kind === 'select') {
      return (
        <select aria-label={l} value={r[c.key] ?? ''} onChange={e => setCell(i, c.key, e.target.value || undefined)}>
          {c.options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      );
    }
    if (c.kind === 'lines') return <LinesField label={l} rows={Math.min(4, Math.max(1, [].concat(r[c.key] ?? '').length))} value={r[c.key]} placeholder={c.placeholder} onCommit={v => setCell(i, c.key, v && v.length === 1 ? v[0] : v)} />;
    return <TextField label={l} value={r[c.key] == null ? '' : String(r[c.key])} optional placeholder={c.placeholder} onCommit={v => setCell(i, c.key, v)} />;
  };
  return (
    <div className="rows" role="group" aria-label={label}>
      {rows.map((r, i) => (
        <div className="rec" key={i}>
          {columns.map(c => <span key={c.key} className={`cell ${c.kind ?? 'text'}`} style={c.width ? { flex: `0 0 ${c.width}` } : undefined}>{cell(r, i, c)}</span>)}
          <button type="button" className="reset" title="Move up" aria-label={`Move ${label} ${i + 1} up`} disabled={i === 0} onClick={() => write(rows.map((x, j) => (j === i - 1 ? rows[i] : j === i ? rows[i - 1] : x)))}>↑</button>
          <button type="button" className="reset" title="Remove" aria-label={`Remove ${label} ${i + 1}`} onClick={() => write(rows.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button type="button" className="btn ghost small" disabled={rows.length >= max} onClick={() => write([...rows, blank])}>+ {add}</button>
      {rows.length >= max && <span className="aside"> at most {max}</span>}
    </div>
  );
}
