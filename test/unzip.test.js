import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { makeZip, crc32 } from '../src/editor/zip.js';
import { readZip } from '../src/editor/unzip.js';

const enc = new TextEncoder(), dec = new TextDecoder();

/** A zip with deflated entries (method 8), as a desktop archiver writes; makeZip only stores. */
function deflatedZip(entries) {
  const parts = [], central = [];
  let offset = 0;
  for (const [path, data] of entries) {
    const name = enc.encode(path), raw = typeof data === 'string' ? enc.encode(data) : data, comp = new Uint8Array(deflateRawSync(raw));
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 8, true);
    local.setUint32(14, crc32(raw), true); local.setUint32(18, comp.length, true); local.setUint32(22, raw.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, comp);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 8, true);
    c.setUint32(16, crc32(raw), true); c.setUint32(20, comp.length, true); c.setUint32(24, raw.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + comp.length;
  }
  const size = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, central.length / 2, true); end.setUint16(10, central.length / 2, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of all) { out.set(p, pos); pos += p.length; }
  return out;
}

describe('readZip', () => {
  it('reads back what makeZip wrote, text and bytes, with a prefix and non-ASCII names', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 0, 1, 2, 3]);
    const zip = makeZip(new Map([['scene.json', '{ "title": "Zażółć" }'], ['media/ żółw.png', png]]), { prefix: 'my-room/' });
    const out = await readZip(zip);
    expect([...out.keys()]).toEqual(['my-room/scene.json', 'my-room/media/ żółw.png']);
    expect(dec.decode(out.get('my-room/scene.json'))).toBe('{ "title": "Zażółć" }');
    expect(out.get('my-room/media/ żółw.png')).toEqual(png);
  });

  it('inflates deflated entries and skips directory entries', async () => {
    const text = 'a'.repeat(5000) + 'b';
    const zip = deflatedZip([['x/', ''], ['x/a.txt', text], ['x/b.bin', new Uint8Array([1, 2, 3])]]);
    const out = await readZip(zip);
    expect([...out.keys()]).toEqual(['x/a.txt', 'x/b.bin']);
    expect(dec.decode(out.get('x/a.txt'))).toBe(text);
    expect(out.get('x/b.bin')).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('rejects what is not a zip, and a truncated one', async () => {
    await expect(readZip(enc.encode('hello, not a zip at all, long enough to scan'))).rejects.toThrow('not a zip file');
    const zip = makeZip(new Map([['a.txt', 'aaaa']]));
    const cut = new Uint8Array(zip.length);
    cut.set(zip.subarray(zip.length - 22), zip.length - 22); // the end record alone, pointing at garbage
    await expect(readZip(cut)).rejects.toThrow('damaged zip');
  });
});
