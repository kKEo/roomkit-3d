import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorld } from './core.jsx';
import { runtime } from '../state/store.js';
import { syncClient, useSync } from '../net/sync.js';
import { flightCurve, posAt } from '../lib/flight.js';
import { dirOf } from '../net/protocol.js';
import { EASE } from '../lib/easing.js';

const MAX = 256;            // instances allocated
const DRAWN = 120;          // at most this many avatars, the nearest ones, are drawn
const BUFFER_MS = 150;      // poses are drawn this far in the past, so there is always a next sample to lerp to
const NEAR = 0.6;           // an avatar this close to the camera is not drawn (it would fill the view)
const HEAD = 0.16, BODY_H = 0.55, BODY_R = 0.17;
const Z = new THREE.Vector3(0, 0, 1);

/** Where a peer is right now: replays its flight, or interpolates its poses; writes position (eye level) and gaze into `out`. */
export function peerPose(peer, serverNow, now, room, out) {
  const { intent, samples } = peer;
  // poses arrive only while flying by hand (the client drops them when a new flight intent comes in)
  if (samples.length) {
    // flying by hand: draw the pose BUFFER_MS ago, between the two samples around that moment
    const t = now - BUFFER_MS;
    let a = samples[0], b = samples[0];
    for (let i = 0; i < samples.length; i++) { if (samples[i].t <= t) a = samples[i]; b = samples[i]; if (samples[i].t > t) break; }
    const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
    out.position.fromArray(a.pose.position).lerp(out.tmp.fromArray(b.pose.position), k);
    const yaw = a.pose.yaw + (b.pose.yaw - a.pose.yaw) * k, pitch = a.pose.pitch + (b.pose.pitch - a.pose.pitch) * k;
    out.dir.fromArray(dirOf(yaw, pitch));
    return true;
  }
  if (!intent) return false;
  const { from, to } = intent;
  if (!to || !intent.duration) {
    out.position.fromArray(from.position);
    out.dir.fromArray(from.target).sub(out.position).normalize();
    return true;
  }
  if (!intent.flight) {
    const p0 = new THREE.Vector3().fromArray(from.position), p1 = new THREE.Vector3().fromArray(to.position);
    const curve = flightCurve(p0, p1, { arc: intent.arc !== false, room });
    intent.flight = { curve, len: curve ? curve.getLength() : 0, p1, t0: new THREE.Vector3().fromArray(from.target), t1: new THREE.Vector3().fromArray(to.target) };
  }
  const tr = intent.flight;
  const t = Math.min(1, Math.max(0, (serverNow - intent.at) / intent.duration));
  const easeFn = Object.hasOwn(EASE, intent.ease) ? EASE[intent.ease] : EASE.quint; // an own name only: "__proto__" would find Object.prototype
  const e = intent.reverse ? 1 - easeFn(1 - t) : easeFn(t);
  const gaze = intent.reverse ? 1 - EASE.cubic(Math.min(1, (1 - t) * 1.3)) : EASE.cubic(Math.min(1, t * 1.3));
  posAt(tr, e, out.position);
  out.dir.lerpVectors(tr.t0, tr.t1, gaze).sub(out.position).normalize();
  return true;
}

/**
 * The other visitors of the event: a head and a body per peer, one instanced mesh each, tinted with
 * the peer's colour, placed where that peer's camera is (flight replay or pose interpolation).
 * This visitor's own avatar is never drawn.
 */
export function Avatars() {
  const active = useSync(s => s.active);
  const { room, theme } = useWorld();
  const heads = useRef(), bodies = useRef();
  const color = useMemo(() => new THREE.Color(), []);
  const out = useMemo(() => ({ position: new THREE.Vector3(), dir: new THREE.Vector3(), tmp: new THREE.Vector3() }), []);
  const m = useMemo(() => ({ mat: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(1, 1, 1), p: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3() }), []);
  const materials = useMemo(() => {
    const head = new THREE.MeshBasicMaterial({ color: theme.accent, toneMapped: false, transparent: true, opacity: 0.9 });
    const body = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, transparent: true, opacity: 0.45, wireframe: true });
    return { head, body };
  }, [theme.accent]);
  useEffect(() => () => { materials.head.dispose(); materials.body.dispose(); }, [materials]);

  useFrame(() => {
    const client = syncClient();
    const H = heads.current, B = bodies.current;
    if (!H || !B) return;
    if (!client) { H.count = B.count = 0; return; }
    const now = Date.now(), serverNow = client.serverNow();
    const cam = runtime.camPos;
    // where everyone is; with a crowd, only the nearest DRAWN get an avatar (the rest keep no `drawn`, so no label either)
    const placed = [];
    for (const peer of client.peers.values()) {
      if (!peerPose(peer, serverNow, now, room, out)) { peer.drawn = null; continue; }
      const dx = out.position.x - cam[0], dy = out.position.y - cam[1], dz = out.position.z - cam[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < NEAR * NEAR) { peer.drawn = null; continue; }
      peer.drawn = out.position.toArray(peer.drawn ?? []);
      peer.dir = out.dir.toArray(peer.dir ?? []);
      peer.d2 = d2;
      placed.push(peer);
    }
    if (placed.length > DRAWN) { placed.sort((a, b) => a.d2 - b.d2); for (let i = DRAWN; i < placed.length; i++) placed[i].drawn = null; placed.length = DRAWN; }
    let n = 0;
    for (const peer of placed) {
      if (n >= MAX) break;
      out.position.fromArray(peer.drawn); out.dir.fromArray(peer.dir);
      // body: upright, turned the way the peer looks
      m.fwd.set(out.dir.x, 0, out.dir.z).normalize();
      m.q.setFromUnitVectors(Z, m.fwd.lengthSq() ? m.fwd : m.fwd.set(0, 0, 1));
      m.p.copy(out.position); m.p.y -= HEAD + BODY_H / 2;
      B.setMatrixAt(n, m.mat.compose(m.p, m.q, m.s));
      // head: looks along the gaze
      m.q.setFromUnitVectors(Z, out.dir);
      H.setMatrixAt(n, m.mat.compose(out.position, m.q, m.s));
      color.set(peer.color);
      H.setColorAt(n, color); B.setColorAt(n, color);
      n++;
    }
    H.count = B.count = n;
    if (n) {
      H.instanceMatrix.needsUpdate = B.instanceMatrix.needsUpdate = true;
      if (H.instanceColor) H.instanceColor.needsUpdate = true;
      if (B.instanceColor) B.instanceColor.needsUpdate = true;
    }
  });

  if (!active) return null;
  return (
    <group>
      <instancedMesh ref={heads} args={[undefined, undefined, MAX]} material={materials.head} frustumCulled={false}>
        <sphereGeometry args={[HEAD, 12, 10]} />
      </instancedMesh>
      <instancedMesh ref={bodies} args={[undefined, undefined, MAX]} material={materials.body} frustumCulled={false}>
        <capsuleGeometry args={[BODY_R, BODY_H - 2 * BODY_R, 3, 8]} />
      </instancedMesh>
    </group>
  );
}
