import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../state/store.js';
import { WorldContext, PoiContext } from './core.jsx';
import { createMaterials } from './materials/hatch.js';
import { createRain } from './rain.js';
import { Room } from './Room.jsx';
import { Particles } from './Particles.jsx';
import { CameraRig } from './CameraRig.jsx';
import { Telemetry } from './Telemetry.jsx';
import { Markers } from './Markers.jsx';
import { PlacedObject } from '../prefabs/index.jsx';

/** Shader time + Matrix-rain refresh (captioned with the current POI). */
function Ticker({ world }) {
  const acc = useRef(0);
  useFrame(({ clock }, dt) => {
    world.mats.shared.uTime.value = clock.elapsedTime;
    acc.current += dt;
    if (acc.current < 0.055) return;
    acc.current = 0;
    const { pois, current } = useStore.getState();
    const poi = pois.find(p => p.id === current);
    world.rain.step(poi ? poi.screenLabel ?? poi.label.toLowerCase() : '');
  });
  return null;
}

function PoiObjects({ poi }) {
  const active = useStore(s => s.shown === poi.id);
  const hovered = useStore(s => s.hover === poi.id);
  return (
    <PoiContext.Provider value={poi.id}>
      {poi.objects.map((o, i) => <PlacedObject key={i} slot={i} object={o} active={active} hovered={hovered} />)}
    </PoiContext.Provider>
  );
}

export function Experience() {
  const scene = useStore(s => s.scene);
  const pois = useStore(s => s.pois);
  const particles = useStore(s => s.gfx.particles);
  const world = useMemo(() => ({
    name: scene.name,
    mats: createMaterials(scene),
    rain: createRain(scene.theme),
    room: scene.room,
    theme: scene.theme,
  }), [scene]);
  useEffect(() => () => { world.mats.dispose(); world.rain.dispose(); }, [world]);
  const { background, fog } = scene.theme;

  return (
    <WorldContext.Provider value={world}>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[background, fog[0], fog[1]]} />
      <Ticker world={world} />
      <Telemetry />
      <CameraRig />
      <Room />
      {scene.decor.map((o, i) => <PlacedObject key={i} slot={i} object={o} />)}
      {pois.map(p => <PoiObjects key={p.id} poi={p} />)}
      <Markers />
      <Particles count={Math.round(scene.effects.particles * particles)} />
    </WorldContext.Provider>
  );
}
