import { describe, it, expect } from 'vitest';
import {
  packPose, packPoses, unpackFrame, gazeOf, dirOf, parseMessage, clientMessage, serverMessage, PROTOCOL_VERSION, POSE_ENTRY_BYTES,
} from '../src/net/protocol.js';

describe('poses', () => {
  it('round-trips a pose to 1 cm and 1/10000 rad', () => {
    const pose = { position: [1.234, -5.678, 12.345], yaw: 2.5, pitch: -0.75 };
    const buf = packPose(pose);
    expect(buf.byteLength).toBe(11);
    const out = unpackFrame(buf);
    expect(out.type).toBe('pose');
    out.pose.position.forEach((v, i) => expect(v).toBeCloseTo(pose.position[i], 2));
    expect(out.pose.yaw).toBeCloseTo(2.5, 4);
    expect(out.pose.pitch).toBeCloseTo(-0.75, 4);
  });

  it('clamps positions beyond ±327 m instead of wrapping', () => {
    const out = unpackFrame(packPose({ position: [1000, 0, -1000], yaw: 0, pitch: 0 }));
    expect(out.pose.position[0]).toBeCloseTo(327.67, 2);
    expect(out.pose.position[2]).toBeCloseTo(-327.68, 2);
  });

  it('batches many poses with ids and flags, 13 bytes each', () => {
    const entries = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, pose: { position: [i, 1, -i], yaw: i / 100, pitch: 0 }, flags: i % 2 }));
    const buf = packPoses(entries);
    expect(buf.byteLength).toBe(3 + 100 * POSE_ENTRY_BYTES);
    const out = unpackFrame(buf);
    expect(out.type).toBe('poses');
    expect(out.entries.length).toBe(100);
    expect(out.entries[42].id).toBe(43);
    expect(out.entries[42].flags).toBe(0);
    expect(out.entries[43].flags).toBe(1);
    expect(out.entries[42].pose.position[0]).toBeCloseTo(42, 2);
  });

  it('reads a Node Buffer view as well as an ArrayBuffer', () => {
    const buf = Buffer.from(packPose({ position: [1, 2, 3], yaw: 0, pitch: 0 }));
    const padded = Buffer.concat([Buffer.alloc(5), buf]).subarray(5);
    expect(unpackFrame(padded).pose.position).toEqual([1, 2, 3]);
  });

  it('rejects malformed frames', () => {
    expect(unpackFrame(new ArrayBuffer(0))).toBe(null);
    expect(unpackFrame(new Uint8Array([1, 0, 0]).buffer)).toBe(null);
    expect(unpackFrame(new Uint8Array([2, 2, 0, 0]).buffer)).toBe(null);
    expect(unpackFrame(new Uint8Array([9]).buffer)).toBe(null);
  });
});

describe('gaze', () => {
  it('yaw and pitch of a gaze come back as the same direction', () => {
    const { yaw, pitch } = gazeOf([0, 2, 10], [3, 1, 0]);
    const d = dirOf(yaw, pitch);
    const len = Math.hypot(3, -1, -10);
    expect(d[0]).toBeCloseTo(3 / len, 5);
    expect(d[1]).toBeCloseTo(-1 / len, 5);
    expect(d[2]).toBeCloseTo(-10 / len, 5);
  });

  it('a zero-length gaze does not blow up', () => {
    expect(gazeOf([1, 1, 1], [1, 1, 1])).toEqual({ yaw: 0, pitch: 0 });
  });
});

describe('text messages', () => {
  const join = { t: 'join', v: PROTOCOL_VERSION, scene: 'loft', name: 'Ada', color: '#00ff66' };

  it('accepts well-formed client messages and rejects unknown or malformed ones', () => {
    expect(parseMessage(clientMessage, JSON.stringify(join))).toEqual(join);
    expect(parseMessage(clientMessage, JSON.stringify({ ...join, color: 'green' }))).toBe(null);
    expect(parseMessage(clientMessage, JSON.stringify({ ...join, extra: 1 }))).toBe(null);
    expect(parseMessage(clientMessage, JSON.stringify({ t: 'nope' }))).toBe(null);
    expect(parseMessage(clientMessage, '{not json')).toBe(null);
    expect(parseMessage(clientMessage, JSON.stringify({ t: 'op', key: 'k', value: { a: [1, 2] } }))).toMatchObject({ t: 'op' });
  });

  it('validates a flight intent', () => {
    const view = { position: [0, 0, 0], target: [0, 0, -1] };
    const ok = { t: 'intent', intent: { kind: 'poi', from: view, to: view, poi: 'desk', duration: 1500, ease: 'quint', arc: true } };
    expect(parseMessage(clientMessage, JSON.stringify(ok))).toEqual(ok);
    expect(parseMessage(clientMessage, JSON.stringify({ t: 'intent', intent: { kind: 'poi', from: view, duration: -1 } }))).toBe(null);
  });

  it('validates server messages too', () => {
    const w = { t: 'welcome', v: 1, id: 1, token: 'x', now: 1, seq: 0, tickMs: 100, peers: [], state: { 'a.b': { value: 1, seq: 1, by: 2 } } };
    expect(parseMessage(serverMessage, JSON.stringify(w))).toEqual(w);
    expect(parseMessage(serverMessage, JSON.stringify({ t: 'reject', key: 'k', reason: 'because' }))).toBe(null);
  });
});
