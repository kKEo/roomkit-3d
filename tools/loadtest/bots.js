#!/usr/bin/env node
/**
 * Load test for the sync server: N fake visitors join one event, fly about and flip a shared switch.
 *
 *   node tools/loadtest/bots.js [--url ws://localhost:8787] [--event load] [--scene loft]
 *                               [--clients 100] [--hz 15] [--seconds 30] [--ops 2]
 *
 * Every bot sends poses at `--hz` (all of them "free flying", the worst case) and `--ops` state ops per
 * second in total across all bots. It reports messages and bytes per second in each direction and
 * the echo latency of its own ops (op sent → `state` received), p50 / p95 / max. Uses Node's built-in
 * WebSocket client (Node 22+).
 */
import { packPose, unpackFrame, PROTOCOL_VERSION } from '../../src/net/protocol.js';

const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? d : process.argv[i + 1]; };
const URL_ = arg('url', 'ws://localhost:8787');
const EVENT = arg('event', 'load');
const SCENE = arg('scene', 'loft');
const N = +arg('clients', 100);
const HZ = +arg('hz', 15);
const SECONDS = +arg('seconds', 30);
const OPS = +arg('ops', 2);

const totals = { in: 0, out: 0, bytesIn: 0, bytesOut: 0, poses: 0, states: 0, rejects: 0, errors: 0 };
const latencies = [];
const pending = new Map(); // op nonce → sent at
let joined = 0, failed = 0, dropped = 0, stopping = false;
const closeCodes = {};

function bot(i) {
  return new Promise(resolve => {
    const ws = new WebSocket(`${URL_}/ws/${EVENT}`);
    ws.binaryType = 'arraybuffer';
    let id = null, timer = null, angle = Math.random() * Math.PI * 2;
    const send = d => { if (ws.readyState === 1) { ws.send(d); totals.out++; totals.bytesOut += typeof d === 'string' ? d.length : d.byteLength; } };
    ws.onopen = () => {
      send(JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, scene: SCENE, name: `bot${i}`, color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0') }));
    };
    ws.onmessage = ev => {
      totals.in++;
      if (typeof ev.data === 'string') {
        totals.bytesIn += ev.data.length;
        const m = JSON.parse(ev.data);
        if (m.t === 'welcome') {
          id = m.id; joined++;
          send(JSON.stringify({ t: 'intent', intent: { kind: 'free', from: { position: [0, 2, 10], target: [0, 1, 0] } } }));
          timer = setInterval(() => {
            angle += 0.05;
            send(packPose({ position: [Math.cos(angle) * 8, 1.7, Math.sin(angle) * 8], yaw: angle, pitch: 0 }));
          }, 1000 / HZ);
        } else if (m.t === 'state') {
          totals.states++;
          if (m.by === id && m.value?.n != null && pending.has(m.value.n)) { latencies.push(performance.now() - pending.get(m.value.n)); pending.delete(m.value.n); }
        } else if (m.t === 'reject') totals.rejects++;
        else if (m.t === 'error') { totals.errors++; console.error(`bot${i}: ${m.code} ${m.message}`); }
      } else {
        totals.bytesIn += ev.data.byteLength;
        const f = unpackFrame(ev.data);
        if (f?.type === 'poses') totals.poses += f.entries.length;
      }
    };
    ws.onerror = () => { failed++; };
    ws.onclose = ev => {
      clearInterval(timer);
      // a close we did not ask for is a dropped visitor: count it, or the run looks healthier than it was
      if (!stopping && id != null) { dropped++; closeCodes[ev.code] = (closeCodes[ev.code] || 0) + 1; }
      resolve();
    };
    bots.push({ send, close: () => ws.close(), get id() { return id; } });
  });
}

const bots = [];
console.log(`${N} bots → ${URL_}/ws/${EVENT} (scene ${SCENE}), ${HZ} Hz poses each, ${OPS} ops/s total, ${SECONDS} s`);
const done = Array.from({ length: N }, (_, i) => bot(i));

let nonce = 0;
const opTimer = setInterval(() => {
  const b = bots[Math.floor(Math.random() * bots.length)];
  if (!b?.id) return;
  const n = ++nonce;
  pending.set(n, performance.now());
  b.send(JSON.stringify({ t: 'op', key: 'load.switch', value: { on: n % 2 === 0, n } }));
}, 1000 / Math.max(0.001, OPS));

const t0 = performance.now();
let last = { ...totals, at: t0 };
const report = setInterval(() => {
  const t = performance.now(), dt = (t - last.at) / 1000;
  const r = k => ((totals[k] - last[k]) / dt);
  console.log(`[${((t - t0) / 1000).toFixed(0).padStart(3)} s] online ${joined - dropped}/${N}  in ${r('in').toFixed(0)} msg/s ${(r('bytesIn') / 1024).toFixed(1)} kB/s  out ${r('out').toFixed(0)} msg/s ${(r('bytesOut') / 1024).toFixed(1)} kB/s  poses ${r('poses').toFixed(0)}/s  states ${r('states').toFixed(0)}/s  rejects ${totals.rejects}`);
  last = { ...totals, at: t };
}, 5000);

setTimeout(async () => {
  clearInterval(opTimer); clearInterval(report);
  stopping = true;
  bots.forEach(b => b.close());
  await Promise.all(done);
  const s = latencies.sort((a, b) => a - b), q = p => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN);
  const secs = (performance.now() - t0) / 1000;
  console.log('\nsummary');
  console.log(`  joined ${joined}, failed ${failed}, dropped ${dropped}${dropped ? ' (close codes ' + JSON.stringify(closeCodes) + ')' : ''}, server errors ${totals.errors}, rejects ${totals.rejects}`);
  console.log(`  received ${totals.in} messages, ${(totals.bytesIn / 1024 / secs).toFixed(1)} kB/s across all bots (${(totals.bytesIn / 1024 / secs / Math.max(1, joined)).toFixed(2)} kB/s per bot)`);
  console.log(`  sent ${totals.out} messages, ${(totals.bytesOut / 1024 / secs).toFixed(1)} kB/s`);
  console.log(`  op echo latency: p50 ${q(0.5).toFixed(1)} ms, p95 ${q(0.95).toFixed(1)} ms, max ${(s.at(-1) ?? NaN).toFixed(1)} ms (${s.length} samples, ${pending.size} unanswered)`);
  process.exit(failed || dropped || totals.errors ? 1 : 0);
}, SECONDS * 1000);
