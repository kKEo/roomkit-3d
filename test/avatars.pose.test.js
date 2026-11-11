import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { peerPose } from '../src/scene/Avatars.jsx';

const out = () => ({ position: new THREE.Vector3(), dir: new THREE.Vector3(), tmp: new THREE.Vector3() });
const view = (x, z) => ({ position: [x, 1.7, z], target: [x, 1.7, z - 1] });
const peer = ease => ({ samples: [], intent: { kind: 'poi', from: view(0, 0), to: view(4, 0), duration: 1000, ease, arc: false, at: 0 } });
const room = { height: 4, centre: [0, 0] };

describe('peerPose', () => {
  it('replays a flight with a known ease', () => {
    const o = out();
    expect(peerPose(peer('linear'), 500, 0, room, o)).toBe(true);
    expect(o.position.x).toBeCloseTo(2, 5);
  });

  it('falls back to the default ease for an inherited property name instead of throwing', () => {
    for (const ease of ['__proto__', 'constructor', 'toString']) {
      const o = out();
      expect(() => peerPose(peer(ease), 500, 0, room, o)).not.toThrow();
      expect(Number.isFinite(o.position.x)).toBe(true);
    }
  });
});
