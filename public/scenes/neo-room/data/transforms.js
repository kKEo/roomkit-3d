/**
 * Transforms for this scene's live feeds: each turns the JSON a feed answers with into what a screen
 * or a block shows. Declared in scene.json as `"transforms": { "nodes": "data/transforms.js#nodes", … }`
 * and named by a feed: `"feed": { "url": "data/nodes.json", "refresh": 15, "transform": "nodes" }`.
 *
 * Like a scene prefab, this is a plain ES module with NO imports. Each function receives the parsed
 * response and `{ previous, url, event }` (`previous` is what it returned last time) and returns the
 * screen's fields (or a block's `data`); returning undefined keeps the previous value.
 * See the operator guide, "Live data".
 */

/** Dashboard screen: one row per node. */
export function nodes(json) {
  return {
    title: `NODES · ${json.fleet}`,
    rows: json.nodes.map(n => ({ node: n.name, region: n.region, status: n.status, load: n.load })),
  };
}

/** The fleet's headline numbers, as a stats list (for the panel block). */
export function fleetSummary(json) {
  const all = json.nodes, online = all.filter(n => n.status === 'online');
  const running = all.filter(n => n.status !== 'offline');
  const avg = running.length ? Math.round(running.reduce((s, n) => s + n.load, 0) / running.length) : 0;
  return [
    { value: online.length, unit: `/${all.length}`, label: 'nodes online' },
    { value: avg, unit: '%', label: 'average load', delta: json.trend?.load },
    { value: all.filter(n => n.status === 'degraded').length, label: 'degraded' },
  ];
}

/** Stats screen: the same numbers. */
export const nodeStats = json => ({ title: 'FLEET', stats: fleetSummary(json) });

/** Bars graph: each node's load, on a 0–100 scale, with the peak in the title bar. */
export function loadSeries(json) {
  const values = json.nodes.map(n => n.load);
  return { values, min: 0, max: 100, readout: `peak ${Math.max(...values)}%` };
}
