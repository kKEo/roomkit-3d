import { parseTree, findNodeAtLocation } from 'jsonc-parser';

/**
 * Edits of a JSON file's text that touch only the node they change, so an author's formatting survives a
 * change made from the tree or the form (`cinema`'s one-object-per-line `decor`, a POI file's layout).
 * A replaced value keeps the shape of the old one (on one line, or spread out); a new property or array item
 * follows its neighbours. Paths are lists of keys and indexes, as `jsonc-parser` takes them.
 */

const lineStart = (t, o) => t.lastIndexOf('\n', o - 1) + 1;
/** The indentation of the line `o` is on. */
const lineIndent = (t, o) => /^[ \t]*/.exec(t.slice(lineStart(t, o)))[0];
const startsLine = (t, o) => /^[ \t]*$/.test(t.slice(lineStart(t, o), o));
const end = n => n.offset + n.length;
const spread = (t, n) => t.slice(n.offset, end(n)).includes('\n');
const flat = v => v === null || typeof v !== 'object';
const splice = (t, from, to, s) => t.slice(0, from) + s + t.slice(to);

/** One line, spaced like hand-written JSON: `{ "a": [1, 2] }`. */
export function inline(v) {
  if (Array.isArray(v)) return v.length ? `[${v.map(inline).join(', ')}]` : '[]';
  if (v && typeof v === 'object') {
    const e = Object.entries(v).filter(([, x]) => x !== undefined);
    return e.length ? `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }` : '{}';
  }
  return JSON.stringify(v);
}

/** Spread over lines from `indent`, with lists of plain values and short objects kept on one line. */
export function pretty(v, indent = '') {
  if (flat(v)) return JSON.stringify(v);
  const one = inline(v);
  if (Array.isArray(v) ? v.every(flat) : one.length + indent.length <= 72 && Object.values(v).every(x => flat(x) || (Array.isArray(x) && x.every(flat)))) return one;
  const i2 = indent + '  ';
  if (Array.isArray(v)) return `[\n${v.map(x => i2 + pretty(x, i2)).join(',\n')}\n${indent}]`;
  const e = Object.entries(v).filter(([, x]) => x !== undefined);
  return `{\n${e.map(([k, x]) => `${i2}${JSON.stringify(k)}: ${pretty(x, i2)}`).join(',\n')}\n${indent}}`;
}

/** Moves the lines after the first from one indentation to another (the first line goes wherever it is put). */
export function reindent(text, from, to) {
  return text.split('\n').map((l, i) => (i === 0 ? l : l.startsWith(from) ? to + l.slice(from.length) : to + l.trimStart())).join('\n');
}

function tree(text) {
  const errors = [];
  const root = parseTree(text, errors);
  if (!root || errors.length) throw new Error('the file is not valid JSON; fix it in Files first');
  return root;
}

/** Where the children of an object or array start, or null when it is written on one line. */
function childIndent(t, n) {
  const first = n.children?.[0];
  if (first && startsLine(t, first.offset)) return lineIndent(t, first.offset);
  return spread(t, n) ? lineIndent(t, n.offset) + '  ' : null;
}

/** The value at `path`, or undefined. */
export function getAt(text, path) {
  const n = findNodeAtLocation(tree(text), path);
  return n ? JSON.parse(text.slice(n.offset, end(n))) : undefined;
}

/** The text of the node at `path`, dedented, so it reads as a file of its own; null when absent. */
export function rawAt(text, path) {
  const n = findNodeAtLocation(tree(text), path);
  return n ? reindent(text.slice(n.offset, end(n)), lineIndent(text, n.offset), '') : null;
}

/** Replaces the node at `path` with `raw` (JSON text, as `rawAt` gives it), indented to fit. */
export function replaceRaw(text, path, raw) {
  JSON.parse(raw);
  const n = findNodeAtLocation(tree(text), path);
  if (!n) throw new Error(`nothing at ${path.join('.')}`);
  return splice(text, n.offset, end(n), reindent(raw.trim(), '', lineIndent(text, n.offset)));
}

/** Sets the value at `path`, adding the missing objects on the way; `undefined` removes it. */
export function setAt(text, path, value) {
  if (value === undefined) return removeAt(text, path);
  const root = tree(text);
  let node = root, i = 0;
  for (; i < path.length; i++) {
    const next = findNodeAtLocation(node, [path[i]]);
    if (!next) break;
    node = next;
  }
  if (i === path.length) {
    const s = spread(text, node) && !flat(value) ? pretty(value, lineIndent(text, node.offset)) : inline(value);
    return splice(text, node.offset, end(node), s);
  }
  if (node.type !== 'object') throw new Error(`${path.slice(0, i).join('.') || 'the file'} is not an object`);
  const v = path.slice(i + 1).reduceRight((acc, k) => ({ [k]: acc }), value);
  return insertProperty(text, node, String(path[i]), v);
}

function insertProperty(t, obj, key, v) {
  const k = JSON.stringify(key);
  const kids = obj.children ?? [];
  const ind = lineIndent(t, obj.offset);
  if (!kids.length) {
    const one = `{ ${k}: ${inline(v)} }`;
    return splice(t, obj.offset, end(obj), one.length + ind.length <= 72 ? one : `{\n${ind}  ${k}: ${pretty(v, ind + '  ')}\n${ind}}`);
  }
  const last = kids[kids.length - 1], ci = childIndent(t, obj);
  if (ci == null) return splice(t, end(last), end(last), `, ${k}: ${inline(v)}`);
  return splice(t, end(last), end(last), `,\n${ci}${k}: ${pretty(v, ci)}`);
}

/** Removes the property or array item at `path` with its comma; nothing when it is absent. */
export function removeAt(text, path) {
  const n = findNodeAtLocation(tree(text), path);
  if (!n) return text;
  const target = n.parent?.type === 'property' ? n.parent : n;
  const box = target.parent;
  const kids = box.children;
  const i = kids.indexOf(target);
  if (i > 0) return splice(text, end(kids[i - 1]), end(target), '');
  if (kids.length > 1) return splice(text, target.offset, kids[1].offset, '');
  return splice(text, box.offset + 1, end(box) - 1, '');
}

/**
 * Inserts an item into the array at `path`, before `index` (-1 or past the end appends). The item is a `value`
 * or `raw` text (an object moved from another file keeps its own layout). A missing array is created.
 */
export function insertAt(text, path, index, { value, raw }) {
  let arr = findNodeAtLocation(tree(text), path);
  if (!arr) { text = setAt(text, path, []); arr = findNodeAtLocation(tree(text), path); }
  if (arr.type !== 'array') throw new Error(`${path.join('.')} is not a list`);
  const kids = arr.children ?? [];
  const n = kids.length;
  const at = index < 0 || index > n ? n : index;
  const item = (ci, oneLine) => (raw != null ? reindent(raw, '', ci) : oneLine ? inline(value) : pretty(value, ci));
  if (!n) {
    const ind = lineIndent(text, arr.offset), ci = ind + '  ';
    return splice(text, arr.offset, end(arr), `[\n${ci}${item(ci, false)}\n${ind}]`);
  }
  const ci = childIndent(text, arr);
  if (ci == null) {
    const s = inline(raw != null ? JSON.parse(raw) : value);
    return at === n ? splice(text, end(kids[n - 1]), end(kids[n - 1]), `, ${s}`) : splice(text, kids[at].offset, kids[at].offset, `${s}, `);
  }
  const oneLine = !spread(text, kids[Math.min(at, n - 1)]);
  return at === n
    ? splice(text, end(kids[n - 1]), end(kids[n - 1]), `,\n${ci}${item(ci, oneLine)}`)
    : splice(text, kids[at].offset, kids[at].offset, `${item(ci, oneLine)},\n${ci}`);
}
