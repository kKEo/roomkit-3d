import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useStore } from './state/store.js';
import { loadScene } from './config/loadScene.js';
import { Experience } from './scene/Experience.jsx';
import { Header } from './ui/Header.jsx';
import { Panel } from './ui/Panel.jsx';
import { Minimap } from './ui/Minimap.jsx';
import { Labels } from './ui/Labels.jsx';
import { SettingsPanel } from './ui/SettingsPanel.jsx';
import { ScreenOverlay } from './ui/ScreenOverlay.jsx';
import { Hint, Loader, Progress } from './ui/Overlays.jsx';
import { useInput, poiIndexFromHash } from './ui/useInput.js';
import { applyTheme } from './ui/theme.js';
import { reducedMotion } from './lib/env.js';
import { fmt } from './lib/text.js';

export function App() {
  const status = useStore(s => s.status);
  const scene = useStore(s => s.scene);
  const total = useStore(s => s.pois.length);
  const [intro, setIntro] = useState(false);
  const stage = useRef(null);

  useEffect(() => {
    loadScene()
      .then(({ scene, pois }) => { applyTheme(scene); useStore.getState().setLoaded(scene, pois); })
      .catch(err => { console.error(err); useStore.getState().setError(err); });
  }, []);

  // fly in from outside the room once the first frames are up
  useEffect(() => {
    if (status !== 'ready') return;
    const t = setTimeout(() => {
      setIntro(true);
      useStore.getState().goTo(poiIndexFromHash(), reducedMotion ? 500 : scene.camera.intro.duration);
    }, reducedMotion ? 100 : 650);
    return () => clearTimeout(t);
  }, [status, scene]);

  useInput(stage, status === 'ready');

  const far = scene ? Math.max(140, 3 * Math.max(scene.room.width, scene.room.depth)) : 140;
  return (
    <>
      <div id="stage" ref={stage}>
        {status === 'ready' && (
          <Canvas
            flat
            linear
            dpr={[1, 2]}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            camera={{ fov: scene.camera.fov, near: 0.05, far, position: scene.camera.intro.position }}
            aria-label={fmt(scene.ui.canvasLabel, { total })}
            onPointerMissed={() => useStore.getState().exitZoom()}
          >
            <Experience />
          </Canvas>
        )}
      </div>
      <div className="fx" aria-hidden="true" />
      {status === 'ready' && (
        <>
          <Progress />
          <Labels />
          <ScreenOverlay />
          <Header />
          <Panel />
          <SettingsPanel />
          <Minimap />
          <Hint />
        </>
      )}
      <Loader done={intro} />
    </>
  );
}
