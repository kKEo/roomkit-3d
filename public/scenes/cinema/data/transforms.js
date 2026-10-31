/**
 * Transforms for this scene's live feeds: each turns the JSON that `data/showtimes.json` answers with
 * into what a booth screen shows. Declared in scene.json as `"transforms": { "board": "data/transforms.js#board", … }`
 * and named by a feed: `"feed": { "url": "data/showtimes.json", "refresh": 20, "transform": "board" }`.
 * Point the feed at a URL that changes and the screens follow it; see the operator guide, "Live data".
 *
 * Like a scene prefab, this is a plain ES module with NO imports.
 */

/** Dashboard screen: one row per screening. */
export function showtimes(json) {
  return {
    title: `PROGRAMME · ${json.house}`,
    rows: json.screens.map(s => ({ screen: s.screen, title: s.title, status: s.status, seats: `${s.sold}/${s.seats}`, starts: s.starts })),
  };
}

/** The house's headline numbers, as a stats list (for the panel block). */
export function houseSummary(json) {
  const all = json.screens;
  const seats = all.reduce((n, s) => n + s.seats, 0), sold = all.reduce((n, s) => n + s.sold, 0);
  return [
    { value: all.filter(s => s.status === 'showing').length, unit: `/${all.length}`, label: 'screens running' },
    { value: Math.round((sold / seats) * 100), unit: '%', label: 'seats sold', delta: json.trend?.seats },
    { value: seats - sold, label: 'seats free' },
  ];
}

/** Stats screen: the same numbers. */
export const houseStats = json => ({ title: 'HOUSE', stats: houseSummary(json) });

/** Bars graph: how full each screening is, 0–100, with the fullest in the title bar. */
export function occupancy(json) {
  const values = json.screens.map(s => Math.round((s.sold / s.seats) * 100));
  return { values, min: 0, max: 100, readout: `peak ${Math.max(...values)}%` };
}

/** Text screen: the board above the doors. */
export function board(json) {
  return {
    title: 'NOW SHOWING',
    lines: json.screens.map(s => `> ${s.starts.padEnd(6)} ${s.title.padEnd(22)} ${s.status}`),
  };
}
