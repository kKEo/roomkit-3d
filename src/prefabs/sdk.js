import * as React from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ScreenSurface } from './media.jsx';
import { reducedMotion } from '../lib/env.js';
import { sdkCore, hatch } from './sdkCore.js';

export { hatch };

/**
 * What a scene-shipped prefab's `component(sdk)` receives. A scene prefab is a plain ES module with
 * no imports, so React, three.js and the app's building blocks all come from here: one React, one
 * three, the same materials and store as the built-in prefabs. `moduleUrl` is the module's own URL,
 * so `assetUrl` can find the files shipped next to it. See docs/guide/operator/extending/scene-prefabs.md.
 *
 * Most of it is `sdkCore` (./sdkCore.js), which runs anywhere; this adds what only a page can give.
 */
export function makeSdk(moduleUrl) {
  const useGLTF = url => useLoader(GLTFLoader, url);
  return Object.freeze({
    ...sdkCore(moduleUrl),
    /** A screen plane, every source included (./media.jsx). */
    ScreenSurface,
    /** Whether the visitor asked for less motion: leave out anything that moves on its own. */
    reducedMotion,
    useLoader,
    /** A glTF/GLB by URL, cached by React Three Fiber; suspends while loading. */
    useGLTF,
    /** A fresh copy of a glTF's scene for this component instance, so the same model can be placed many times. */
    useModel: url => { const gltf = useGLTF(url); return React.useMemo(() => gltf.scene.clone(true), [gltf]); },
    /** An image texture by URL, cached; suspends while loading. */
    useTexture: url => useLoader(THREE.TextureLoader, url),
  });
}
