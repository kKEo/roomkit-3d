import { z } from 'zod';
import { EASE } from '../lib/easing.js';

/**
 * The wire protocol between the viewer and the sync server (server/), shared by both ends. No browser
 * or Node globals here, so it runs under test and on either side.
 *
 * Two kinds of frames travel over one WebSocket:
 * - **binary** frames carry camera poses, the one high-rate thing: byte 0 is the frame type, the rest
 *   is fixed-width integers (DataView, little-endian). A client sends its own pose (`packPose`), the
 *   server batches every pose that changed since its last tick into one frame (`packPoses`).
 * - **text** frames carry everything else as JSON with a `t` field, validated with zod on both ends
 *   (`clientMessage`, `serverMessage`): join/welcome, flight intents, shared-state ops, leases, ping.
 *
 * Positions are quantised to 1 cm within ±327 m, angles to 1/10000 rad, so a pose is 10 bytes and a
 * batch entry 13 (id + pose + flags). See docs/guide/operator/internals/multiplayer.md.
 */

export const PROTOCOL_VERSION = 1;

/** Binary frame types (byte 0). */
export const FRAME = Object.freeze({ POSE: 1, POSES: 2 });

/** Flag bits of a batched pose. */
export const POSE_FLAGS = Object.freeze({ FREE: 1 });

const POS_SCALE = 100;      // metres → centimetres
const ANG_SCALE = 10000;    // radians → 1/10000 rad
const POSE_BYTES = 10;      // 3 × i16 position + yaw i16 + pitch i16
export const POSE_ENTRY_BYTES = 2 + POSE_BYTES + 1; // id + pose + flags
export const MAX_POSES_PER_FRAME = 65535;

const clampI16 = v => Math.max(-32768, Math.min(32767, Math.round(v)));

/** Yaw (around +Y, from +Z towards +X) and pitch (up positive) of a gaze from `position` to `target`. */
export function gazeOf(position, target) {
  const dx = target[0] - position[0], dy = target[1] - position[1], dz = target[2] - position[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  return { yaw: Math.atan2(dx, dz), pitch: Math.asin(Math.max(-1, Math.min(1, dy / len))) };
}

/** Unit gaze direction from yaw and pitch (the inverse of `gazeOf`). */
export function dirOf(yaw, pitch) {
  const c = Math.cos(pitch);
  return [Math.sin(yaw) * c, Math.sin(pitch), Math.cos(yaw) * c];
}

function writePose(view, off, pose) {
  view.setInt16(off, clampI16(pose.position[0] * POS_SCALE), true);
  view.setInt16(off + 2, clampI16(pose.position[1] * POS_SCALE), true);
  view.setInt16(off + 4, clampI16(pose.position[2] * POS_SCALE), true);
  view.setInt16(off + 6, clampI16(pose.yaw * ANG_SCALE), true);
  view.setInt16(off + 8, clampI16(pose.pitch * ANG_SCALE), true);
}

function readPose(view, off) {
  return {
    position: [view.getInt16(off, true) / POS_SCALE, view.getInt16(off + 2, true) / POS_SCALE, view.getInt16(off + 4, true) / POS_SCALE],
    yaw: view.getInt16(off + 6, true) / ANG_SCALE,
    pitch: view.getInt16(off + 8, true) / ANG_SCALE,
  };
}

/** A client's own pose `{ position, yaw, pitch }` as a POSE frame (11 bytes). */
export function packPose(pose) {
  const buf = new ArrayBuffer(1 + POSE_BYTES);
  const view = new DataView(buf);
  view.setUint8(0, FRAME.POSE);
  writePose(view, 1, pose);
  return buf;
}

/** Poses of many clients `[{ id, pose, flags }]` as one POSES frame: type, count (u16), then 13-byte entries. */
export function packPoses(entries) {
  const n = Math.min(entries.length, MAX_POSES_PER_FRAME);
  const buf = new ArrayBuffer(3 + n * POSE_ENTRY_BYTES);
  const view = new DataView(buf);
  view.setUint8(0, FRAME.POSES);
  view.setUint16(1, n, true);
  let off = 3;
  for (let i = 0; i < n; i++) {
    const { id, pose, flags = 0 } = entries[i];
    view.setUint16(off, id, true);
    writePose(view, off + 2, pose);
    view.setUint8(off + 12, flags & 255);
    off += POSE_ENTRY_BYTES;
  }
  return buf;
}

/**
 * Decodes a binary frame (ArrayBuffer, or anything with a buffer / byteOffset / byteLength, like a Node
 * Buffer): `{ type: 'pose', pose }` or `{ type: 'poses', entries }`; null for a frame that is not well formed.
 */
export function unpackFrame(data) {
  const view = data instanceof ArrayBuffer ? new DataView(data) : new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.byteLength < 1) return null;
  const type = view.getUint8(0);
  if (type === FRAME.POSE) {
    if (view.byteLength !== 1 + POSE_BYTES) return null;
    return { type: 'pose', pose: readPose(view, 1) };
  }
  if (type === FRAME.POSES) {
    if (view.byteLength < 3) return null;
    const n = view.getUint16(1, true);
    if (view.byteLength !== 3 + n * POSE_ENTRY_BYTES) return null;
    const entries = [];
    for (let i = 0, off = 3; i < n; i++, off += POSE_ENTRY_BYTES) {
      entries.push({ id: view.getUint16(off, true), pose: readPose(view, off + 2), flags: view.getUint8(off + 12) });
    }
    return { type: 'poses', entries };
  }
  return null;
}

// ---- text messages -------------------------------------------------------------------------

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
export const viewSchema = z.strictObject({ position: vec3, target: vec3 });
const id = z.number().int().min(0).max(65535);
const key = z.string().min(1).max(200);
const name = z.string().trim().min(1).max(24);
const color = z.string().regex(/^#[0-9a-f]{6}$/i, 'a colour is #rrggbb');
/** Any JSON value a shared key may hold, bounded in size by the server's message limit. */
const value = z.any();

/**
 * What a client says about where its camera is going, so every peer can replay the same flight
 * (src/lib/flight.js) instead of receiving the pose at 10 Hz:
 * - `poi`: flying to the view of a POI (`to` is that view; `poi` its id, or null for the overview);
 * - `view`: flying to a fixed pose (`camera.start`), `to` given;
 * - `zoom`: flying straight to a screen (`to` is the camera pose in front of it, `zoom` the screen key);
 * - `free`: flying by hand from here on (poses follow in binary frames);
 * - `still`: parked (after a free flight stopped, or on join).
 * `from` is the pose at the start, `duration` ms, `arc` whether the path lifts through the room centre.
 */
export const intentSchema = z.strictObject({
  kind: z.enum(['poi', 'view', 'zoom', 'free', 'still']),
  from: viewSchema,
  to: viewSchema.optional(),
  poi: z.string().nullable().optional(),
  zoom: z.string().optional(),
  duration: z.number().min(0).max(60000).optional(),
  ease: z.enum(Object.keys(EASE)).optional(),
  arc: z.boolean().optional(),
  /** the flight profile played backwards (the way back from a screen) */
  reverse: z.boolean().optional(),
});

const base = { ping: z.strictObject({ t: z.literal('ping'), c: z.number() }) };

export const clientMessage = z.discriminatedUnion('t', [
  z.strictObject({
    t: z.literal('join'),
    v: z.literal(PROTOCOL_VERSION),
    scene: z.string().min(1).max(64),
    name,
    color,
    resume: z.strictObject({ id, token: z.string().min(8).max(64) }).optional(),
  }),
  z.strictObject({ t: z.literal('intent'), intent: intentSchema }),
  z.strictObject({ t: z.literal('op'), key, value, base: z.number().int().optional() }),
  z.strictObject({ t: z.literal('grab'), key }),
  z.strictObject({ t: z.literal('drop'), key }),
  z.strictObject({ t: z.literal('profile'), name: name.optional(), color: color.optional() }),
  base.ping,
]);

export const peerSchema = z.strictObject({
  id,
  name,
  color,
  intent: intentSchema.extend({ at: z.number() }).nullable(),
});

const entry = z.strictObject({ value, seq: z.number().int(), by: id.nullable(), owner: id.nullable().optional(), until: z.number().optional() });

export const serverMessage = z.discriminatedUnion('t', [
  z.strictObject({
    t: z.literal('welcome'),
    v: z.literal(PROTOCOL_VERSION),
    id,
    token: z.string(),
    now: z.number(),
    seq: z.number().int(),
    tickMs: z.number().positive(),
    peers: z.array(peerSchema),
    state: z.record(key, entry),
  }),
  z.strictObject({ t: z.literal('join'), peer: peerSchema }),
  z.strictObject({ t: z.literal('leave'), id }),
  z.strictObject({ t: z.literal('profile'), id, name, color }),
  z.strictObject({ t: z.literal('intent'), id, intent: intentSchema.extend({ at: z.number() }) }),
  z.strictObject({ t: z.literal('state'), key, value, seq: z.number().int(), by: id.nullable() }),
  z.strictObject({ t: z.literal('lease'), key, owner: id.nullable(), until: z.number().optional() }),
  z.strictObject({ t: z.literal('reject'), key, reason: z.enum(['leased', 'stale', 'limit', 'size']), seq: z.number().int().optional(), value: value.optional() }),
  z.strictObject({ t: z.literal('pong'), c: z.number(), s: z.number() }),
  z.strictObject({ t: z.literal('error'), code: z.enum(['version', 'full', 'scene', 'invalid', 'origin']), message: z.string() }),
]);

/** Parses a text frame against `schema`; null when it is not JSON or not a known message. */
export function parseMessage(schema, text) {
  let json;
  try { json = JSON.parse(text); } catch { return null; }
  const r = schema.safeParse(json);
  return r.success ? r.data : null;
}
