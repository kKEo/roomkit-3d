import { useEffect, useState } from 'react';
import { dashboardColumns, filterRows } from '../../scene/screens.js';
import { fmt } from '../../lib/text.js';

/** Filterable table: a chip group per `filters` key, free-text search, and a bar for the `value` column. */
export function Dashboard({ config, session, ui }) {
  const { rows = [], filters = [], value } = config;
  const cols = dashboardColumns(config);
  const [chips, setChips] = useState(session.chips ?? {});
  const [query, setQuery] = useState(session.query ?? '');
  useEffect(() => { session.chips = chips; session.query = query; }, [chips, query, session]);

  const shown = filterRows(config, { chips, query });
  const max = Math.max(1, ...rows.map(r => Number(r[value]) || 0));

  return (
    <div className="dash">
      <div className="dash-bar">
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={ui.filterSearch} aria-label={ui.filterSearch} />
        <span role="status">{fmt(ui.filterCount, { n: shown.length, total: rows.length })}</span>
      </div>
      {filters.map(key => {
        const values = [...new Set(rows.map(r => String(r[key])))];
        return (
          <div className="chips" role="group" aria-label={key} key={key}>
            <b>{key}</b>
            {[null, ...values].map(v => (
              <button
                type="button" key={v ?? ''} aria-pressed={(chips[key] ?? null) === v}
                onClick={() => setChips(c => ({ ...c, [key]: v }))}
              >{v ?? ui.filterAll}</button>
            ))}
          </div>
        );
      })}
      <table>
        <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i}>
              {cols.map(c => (
                <td key={c}>
                  {c === value && <i className="dash-val" style={{ width: `${((Number(r[c]) || 0) / max) * 100}%` }} />}
                  <span>{String(r[c] ?? '')}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
