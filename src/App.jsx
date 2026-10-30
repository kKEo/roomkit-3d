import { Component, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useStore, runtime } from './state/store.js';
import { loadScene } from './config/loadScene.js';
import { Experience } from './scene/Experience.jsx';
import { Header } from './ui/Header.jsx';
import { Panel } from './ui/Panel.jsx';
import { Minimap } from './ui/Minimap.jsx';
import { Labels } from './ui/Labels.jsx';
import { Options } from './ui/Options.jsx';
import { ScreenOverlay } from './ui/ScreenOverlay.jsx';
import { Hint, Loader, Progress } from './ui/Overlays.jsx';
import { PerfHud } from './ui/PerfHud.jsx';
import { useInput, poiIdFromHash } from './ui/useInput.js';
import { applyTheme } from './ui/theme.js';
import { reducedMotion, hasWebGL2 } from './lib/env.js';
import { fmt } from './lib/text.js';
import { dprOf } from './lib/gfx.js';

/** Turns a failed WebGL context (e.g. a blocklisted GPU) into the "unsupported" screen; other errors pass on. */
class WebGLBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { if (/webgl/i.test(error?.message)) this.props.onFail(); }
  render() {
    const { error } = this.state;
    if (error && !/webgl/i.test(error.message)) throw error;
    return error ? null : this.props.children;
  }
}

/**
 * The room and its overlays, rendering whatever scene is in the store. Used by the viewer (`App`)
 * and by the editor, which installs scenes itself; the first time the store turns `ready` it
 * flies the camera in from the intro pose.
 */
export function Viewer() {
  const status = useStore(s => s.status);
  const scene = useStore(s => s.scene);
  const total = useStore(s => s.pois.length);
  const [webgl, setWebgl] = useState(hasWebGL2);
  const live = status === 'ready' && webgl;
  const [intro, setIntro] = useState(false);
  const introDone = useRef(false);
  const stage = useRef(null);
  const gfx = useStore(s => s.gfx);
  // antialias and the GPU preference only take effect in a new WebGL context: keep the ones it was made with
  const [glAttrs] = useState(() => ({ antialias: gfx.antialias, powerPreference: gfx.power }));
  useEffect(() => { runtime.glAttrs = { antialias: glAttrs.antialias, power: glAttrs.powerPreference }; }, [glAttrs]);

  // fly in from outside the room once the first frames are up
  useEffect(() => {
    if (!live || introDone.current) return;
    introDone.current = true;
    const t = setTimeout(() => {
      setIntro(true);
      const st = useStore.getState();
      st.goTo(poiIdFromHash(), reducedMotion ? 500 : st.scene.camera.intro.duration);
    }, reducedMotion ? 100 : 650);
    return () => clearTimeout(t);
  }, [live]);

  useInput(stage, live);

  const far = scene ? Math.max(140, 3 * Math.max(scene.room.width, scene.room.depth)) : 140;
  return (
    <>
      <div id="stage" ref={stage}>
        {live && (
          <WebGLBoundary onFail={() => setWebgl(false)}>
            <Canvas
              flat
              linear
              dpr={dprOf(gfx)}
              frameloop={gfx.fps ? 'never' : 'always'}
              gl={glAttrs}
              camera={{ fov: scene.camera.fov, near: 0.05, far, position: scene.camera.intro.position }}
              aria-label={fmt(scene.ui.canvasLabel, { total })}
              onPointerMissed={() => useStore.getState().exitZoom()}
            >
              <Experience />
            </Canvas>
          </WebGLBoundary>
        )}
      </div>
      <div className="fx" aria-hidden="true" />
      {live && (
        <>
          <Progress />
          <Labels />
          <ScreenOverlay />
          <Header />
          <Panel />
          <Options />
          <PerfHud />
          <Minimap />
          <Hint />
        </>
      )}
      <Loader done={intro && webgl} unsupported={!webgl} />
    </>
  );
}

/** The published viewer: loads the scene named in the URL and shows it. */
export function App() {
  useEffect(() => {
    loadScene()
      .then(({ scene, pois }) => { applyTheme(scene); useStore.getState().setLoaded(scene, pois); })
      .catch(err => { console.error(err); useStore.getState().setError(err); });
  }, []);
  return <Viewer />;
}
