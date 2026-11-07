/**
 * A zip reader for the editor's Import: stored and deflated entries, UTF-8 names, no ZIP64 and no
 * encryption (what `makeZip` writes, and what desktop archivers produce for a scene folder). Inflating uses the
 * browser's `DecompressionStream`, so there is no dependency. Directory entries are skipped.
 */

const SIG_EOCD = 0x06054b50, SIG_CEN = 0x02014b50, SIG_LOC = 0x04034b50;
const utf8 = new TextDecoder();

async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** `Map<path, Uint8Array>` of the archive's files. Throws on anything that is not a plain zip. */
export async function readZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const count = dv.getUint16(eocd + 10, true), cenOff = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cenOff === 0xffffffff) throw new Error('ZIP64 archives are not supported');
  const out = new Map();
  let p = cenOff;
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== SIG_CEN) throw new Error('damaged zip: central directory');
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const loc = dv.getUint32(p + 42, true);
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    if (flags & 0x1) throw new Error(`${name}: encrypted entries are not supported`);
    if (loc + 30 > bytes.length || dv.getUint32(loc, true) !== SIG_LOC) throw new Error(`damaged zip: ${name}`);
    const start = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true);
    const data = bytes.subarray(start, start + csize);
    if (method === 0) out.set(name, data.slice()); // a copy, so the archive's buffer can go
    else if (method === 8) {
      const u = await inflate(data);
      if (u.length !== usize) throw new Error(`${name}: damaged entry`);
      out.set(name, u);
    } else throw new Error(`${name}: compression method ${method} is not supported`);
  }
  return out;
}
