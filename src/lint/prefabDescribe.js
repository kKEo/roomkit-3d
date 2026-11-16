import { moved, openStage } from './stage.js';
import { partLabel } from './prefabRules.js';

/**
 * A scene prefab read back in words and as a drawing, from the graph its component really makes (src/lint/stage.js):
 * each part with its shape, size and place, the measured size against the declared one, what is clickable, what
 * moves, and its outline from the front, the side and above. This is `node tools/scene.js prefab describe`: what an
 * author or a coding agent reads to tell whether the code builds the thing that was described, without a browser.
 */

const n = v => String(Math.round(v * 100) / 100);
const size = b => `${n(b.max[0] - b.min[0])} wide × ${n(b.max[1] - b.min[1])} high × ${n(b.max[2] - b.min[2])} deep`;
const span = b => `x ${n(b.min[0])}…${n(b.max[0])}, y ${n(b.min[1])}…${n(b.max[1])}, z ${n(b.min[2])}…${n(b.max[2])}`;
const mid = b => `[${[0, 1, 2].map(i => n((b.min[i] + b.max[i]) / 2)).join(', ')}]`;

/**
 * The three views: which two axes each shows and which way they run on paper. Front is what a visitor standing
 * in front of the object sees; the side view is from its left as that visitor sees it (+x), so its front is on the left;
 * the top view has the object's front at the bottom, as on a floor plan with north up.
 */
export const VIEWS = {
  front: { across: 0, up: 1, flip: false, says: 'from the front: x runs right, y up' },
  side: { across: 2, up: 1, flip: true, says: 'from its right-hand side: its front (+z) is on the left, y up' },
  top: { across: 0, up: 2, flip: false, down: true, says: 'from above: x runs right, its front (+z) is at the bottom' },
};

/** A drawing's segments in paper coordinates [x0, y0, x1, y1], y growing downwards, with the paper's size. */
function project(edges, box, view) {
  const lo = [box.min[view.across], box.min[view.up]], hi = [box.max[view.across], box.max[view.up]];
  const X = v => (view.flip ? hi[0] - v : v - lo[0]), Y = v => (view.down ? v - lo[1] : hi[1] - v);
  const out = [];
  for (const { part, index, segments } of edges) {
    for (let i = 0; i < segments.length; i += 6) out.push({ part, index, at: [X(segments[i + view.across]), Y(segments[i + view.up]), X(segments[i + 3 + view.across]), Y(segments[i + 3 + view.up])] });
  }
  return { lines: out, width: hi[0] - lo[0], height: hi[1] - lo[1] };
}

/** One view as lines of text: `#` the edges of solid parts, `:` free lines, at most `cols` characters wide (a character is twice as tall as wide). */
export function viewText(edges, box, name, cols = 56) {
  const view = VIEWS[name], { lines, width, height } = project(edges, box, view);
  const cell = Math.max(0.02, Math.ceil((Math.max(width, height * 2, 0.1) / cols) * 100) / 100);
  const w = Math.max(1, Math.ceil(width / cell) + 1), rows = Math.max(1, Math.ceil(height / (cell * 2)) + 1);
  const grid = Array.from({ length: rows }, () => new Array(w).fill(' '));
  for (const { part, at: [x0, y0, x1, y1] } of lines) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (cell / 2))), ch = part.kind === 'lines' ? ':' : '#';
    for (let i = 0; i <= steps; i++) {
      const c = Math.min(w - 1, Math.round((x0 + ((x1 - x0) * i) / steps) / cell)), r = Math.min(rows - 1, Math.round((y0 + ((y1 - y0) * i) / steps) / (cell * 2)));
      if (ch === '#' || grid[r][c] === ' ') grid[r][c] = ch;
    }
  }
  return [`${name} (${view.says}; one character is ${n(cell)} m wide, one line ${n(cell * 2)} m):`, ...grid.map(r => `  ${r.join('').replace(/\s+$/, '')}`)];
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The three views side by side as an SVG document: solid edges, free lines faint, clickable parts brighter, the declared box dashed. */
export function viewsSvg(title, edges, box, declared = null, scale = 90) {
  const pad = 0.5, gapX = 0.8, out = [];
  let x = pad, tall = 0;
  for (const name of Object.keys(VIEWS)) {
    const view = VIEWS[name], { lines, width, height } = project(edges, box, view);
    const X = v => ((x + v) * scale).toFixed(1), Y = v => ((pad + 0.4 + v) * scale).toFixed(1);
    out.push(`<text x="${X(0)}" y="${(pad * scale).toFixed(1)}" fill="#39d98a">${name}: ${esc(view.says)}</text>`);
    if (declared) {
      const lo = [declared.min[view.across], declared.min[view.up]], hi = [declared.max[view.across], declared.max[view.up]];
      const bx = view.flip ? box.max[view.across] - hi[0] : lo[0] - box.min[view.across], by = view.down ? lo[1] - box.min[view.up] : box.max[view.up] - hi[1];
      out.push(`<rect x="${X(bx)}" y="${Y(by)}" width="${((hi[0] - lo[0]) * scale).toFixed(1)}" height="${((hi[1] - lo[1]) * scale).toFixed(1)}" fill="none" stroke="#ffd166" stroke-dasharray="6 5" stroke-width="1"/>`);
    }
    for (const { part, at } of lines) {
      const stroke = part.kind === 'lines' ? '#39d98a" stroke-opacity=".4' : part.hotspot || part.id ? '#e8fff2' : '#39d98a';
      out.push(`<line x1="${X(at[0])}" y1="${Y(at[1])}" x2="${X(at[2])}" y2="${Y(at[3])}" stroke="${stroke}" stroke-width="${part.kind === 'lines' ? 1 : 1.6}"/>`);
    }
    x += width + gapX;
    tall = Math.max(tall, height);
  }
  const w = ((x - gapX + pad) * scale).toFixed(0), hgt = ((tall + pad * 2 + 0.4) * scale).toFixed(0);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}" font-family="monospace" font-size="13">`,
    `<title>${esc(title)}: front, side and top</title>`, '<rect width="100%" height="100%" fill="#0b0f0c"/>', ...out, '</svg>',
  ].join('\n');
}

/**
 * Describes one scene prefab (`entry` is its registry entry) for the given props, the defaults unless others are
 * handed in (already parsed by its schema). Resolves to `{ lines, svg }`: the text, and the drawing as an SVG string.
 */
export async function describePrefab(type, entry, { props = entry.props, views = ['front', 'side', 'top'] } = {}) {
  const stage = await openStage(entry);
  try {
    const title = `${type}${entry.title ? `: "${entry.title}"` : ''}${entry.blurb ? `, ${entry.blurb}` : ''}`;
    if (!(await stage.render(props))) return { lines: [title, `it does not render: ${stage.error?.message ?? 'nothing was drawn'}`], svg: null };
    const parts = stage.parts(), m = stage.measure(), edges = stage.edges();
    let g = null;
    try { g = entry.geometry?.(props) ?? null; } catch { /* `prefab check` reports it */ }
    const before = stage.snapshot();
    await stage.frames(30, 1 / 30);
    const moving = new Set(moved(before, stage.snapshot(), parts));
    const count = kind => parts.filter(p => p.kind === kind).length;
    const tally = [['solid', 'solid'], ['outline', 'outline only'], ['screen', 'screen'], ['mesh', 'own mesh'], ['lines', 'line set']].filter(([k]) => count(k)).map(([k, word]) => `${count(k)} ${word}${count(k) === 1 || k === 'outline' ? '' : 's'}`);
    const lines = [
      title,
      g ? `declared: a ${g.mount} object, faces ${g.front}; ${size(g)}${g.round ? ' (round)' : ''}: ${span(g)}` : 'declared: no `geometry`, so scenes cannot check where it stands',
      m.body ? `measured: its solid parts are ${size(m.body)}: ${span(m.body)}${m.lines ? `; lines reach ${span(m.all)}` : ''}` : 'measured: it draws no solid part',
      `props: ${JSON.stringify(props)}`,
      `parts (${tally.join(', ') || 'none'}):`,
      ...parts.map((p, i) => {
        const what = p.kind === 'solid' || p.kind === 'outline' ? `${p.shape}${p.kind === 'outline' ? ' outline' : ''}` : p.kind === 'screen' ? `screen${p.id ? ` "${p.id}"` : ''}` : p.kind;
        const more = [p.fill && p.fill !== 'main' && p.kind === 'solid' ? `fill ${p.fill}` : null, p.line && p.line !== 'thick' && p.kind !== 'lines' ? `line ${p.line}` : null, p.kind === 'lines' ? p.line : null,
          p.hotspot ? `clickable as "${p.hotspot}"` : null, p.foreign ? 'its own material' : null, moving.has(p) ? 'moves' : null].filter(Boolean);
        return `  ${String(i + 1).padStart(2)}  ${p.name ? `"${p.name}" ` : ''}${what}${p.box ? ` ${size(p.box).replace(/ (wide|high|deep)/g, '')} at ${mid(p.box)}` : ''}${more.length ? `; ${more.join(', ')}` : ''}`;
      }),
      `clickable parts: ${[...stage.asked].join(', ') || 'none'}`,
      `moves on its own: ${moving.size ? [...moving].map(p => partLabel(p, parts.indexOf(p))).join(', ') : 'nothing'}`,
    ];
    const box = m.all ?? { min: [0, 0, 0], max: [0, 0, 0] };
    if (m.all) for (const name of views) lines.push('', ...viewText(edges, box, name));
    return { lines, svg: m.all ? viewsSvg(title, edges, box, g) : null };
  } finally { await stage.close(); }
}

const TITLE = type => type.replace(/([a-z0-9])([A-Z])/g, (_, a, b) => `${a} ${b.toLowerCase()}`).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const NAME = type => type.replace(/(^|_)([a-z])/g, (_, _u, c) => c.toUpperCase());

/** How a box-shaped body of width × height × depth sits for each mount: the box's corners and the body's centre, as source text. */
const MOUNTS = {
  floor: { origin: 'the floor under its middle', min: '[-p.width / 2, 0, -p.depth / 2]', max: '[p.width / 2, p.height, p.depth / 2]', at: '[0, height / 2, 0]', focus: '[0, p.height / 2, 0]', eye: 'Math.max(1.6, p.height * 0.75)', marker: '[0, p.height + 0.6, 0]' },
  wall: { origin: 'the wall surface behind its middle', min: '[-p.width / 2, -p.height / 2, 0]', max: '[p.width / 2, p.height / 2, p.depth]', at: '[0, 0, depth / 2]', focus: '[0, 0, 0]', eye: 'null', marker: '[0, p.height / 2 + 0.5, 0.3]' },
  ceiling: { origin: 'the ceiling above its middle', min: '[-p.width / 2, -p.height, -p.depth / 2]', max: '[p.width / 2, 0, p.depth / 2]', at: '[0, -height / 2, 0]', focus: '[0, -p.height / 2, 0]', eye: 'null', marker: '[0, -p.height - 0.6, 0]' },
  free: { origin: 'its middle', min: '[-p.width / 2, -p.height / 2, -p.depth / 2]', max: '[p.width / 2, p.height / 2, p.depth / 2]', at: '[0, 0, 0]', focus: '[0, 0, 0]', eye: 'null', marker: '[0, p.height / 2 + 0.6, 0]' },
};
export const MOUNT_NAMES = Object.keys(MOUNTS);

/** The text of a new scene prefab module: one box that follows three size props, ready to be given its real parts. It passes `prefab check` as it is. */
export function prefabTemplate(type, { mount = 'floor', title = TITLE(type), scene = '<scene>' } = {}) {
  const m = MOUNTS[mount];
  return `/**
 * ${title}: an object type shipped with the scene rather than compiled into the app.
 * Origin = ${m.origin}; it faces +Z; metres.
 *
 * A scene prefab is a plain ES module with NO imports: everything it needs is handed to its two exports.
 * After every change:   node tools/scene.js prefab check ${scene} ${type}
 * To see what it makes: node tools/scene.js prefab describe ${scene} ${type}
 */

/** Describes the props. Runs in the browser and in Node, so no DOM or three.js here. Every prop needs a default. */
export function meta({ z }) {
  return {
    schema: z.strictObject({
      width: z.number().positive().default(1).describe('metres across'),
      height: z.number().positive().default(1).describe('metres tall'),
      depth: z.number().positive().default(1).describe('metres front to back'),
    }),
    title: ${JSON.stringify(title)},
    blurb: 'say in a line what it is',
    glyph: '◇',
    // the names a scene can bind a click to; each must be the \`hotspot\` of a part below
    hotspots: ['body'],
    // the box that holds every solid part, for every prop: scene checks and placement by wall trust it
    geometry: p => ({ min: ${m.min}, max: ${m.max}, mount: '${mount}' }),
    // where a stop's automatic camera looks (focus), from how far and how high, and where its marker floats
    placement: p => ({ focus: ${m.focus}, cameraDistance: Math.max(4, Math.max(p.height, p.width / 1.78) * 2 + p.depth), cameraHeight: ${m.eye}, markerOffset: ${m.marker} }),
  };
}

/** Builds the component. \`sdk\` carries React (\`h\` is createElement), the hooks and the building blocks: Solid, Segs, ScreenSurface… */
export function component({ h, Solid }) {
  return function ${NAME(type)}({ props, hovered }) {
    const { width, height, depth } = props;
    return h('group', null,
      // one part per call; give each a \`name\`, it is how \`prefab describe\` and the checks call it
      h(Solid, { name: 'body', hotspot: 'body', args: [width, height, depth], position: ${m.at}, line: hovered ? 'glow' : 'thick' }),
    );
  };
}
`;
}
