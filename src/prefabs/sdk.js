import * as React from 'react';
import * as THREE from 'three';
import { useFrame, useThree, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { Solid, Segs, Outline, useGeometry, useWorld, useHotspot, shapeArgs } from '../scene/core.jsx';
import { ScreenSurface } from './media.jsx';
import { useStore, runtime } from '../state/store.js';
import { reducedMotion } from '../lib/env.js';
import { toRad, circlePts } from '../lib/math.js';
import { META_SDK } from './metaSdk.js';

/**
 * What a scene-shipped prefab's `component(sdk)` receives. A scene prefab is a plain ES module with
 * no imports, so React, three.js and the app's building blocks all come from here: one React, one
 * three, the same materials and store as the built-in prefabs. `moduleUrl` is the module's own URL,
 * so `assetUrl` can find the files shipped next to it. See docs/guide/operator/extending/scene-prefabs.md.
 */
export function makeSdk(moduleUrl) {
  const assetUrl = rel => new URL(rel, moduleUrl).href;
  const useGLTF = url => useLoader(GLTFLoader, url);
  return Object.freeze({
    ...META_SDK,
    // React
    React,
    h: React.createElement,
    useState: React.useState, useRef: React.useRef, useEffect: React.useEffect, useMemo: React.useMemo, useCallback: React.useCallback,
    // three.js and React Three Fiber
    THREE,
    useFrame, useThree, useLoader, GLTFLoader,
    // the app's building blocks (see src/scene/core.jsx and src/prefabs/media.jsx)
    Solid, Segs, Outline, useGeometry, shapeArgs, ScreenSurface,
    useWorld, useHotspot, useStore, runtime, reducedMotion, toRad, circlePts,
    // the prefab's own files
    moduleUrl,
    assetUrl,
    /** A glTF/GLB by URL, cached by React Three Fiber; suspends while loading. */
    useGLTF,
    /** A fresh copy of a glTF's scene for this component instance, so the same model can be placed many times. */
    useModel: url => { const gltf = useGLTF(url); return React.useMemo(() => gltf.scene.clone(true), [gltf]); },
    /** An image texture by URL, cached; suspends while loading. */
    useTexture: url => useLoader(THREE.TextureLoader, url),
    hatch,
  });
}

/**
 * Makes an imported model match the look: every mesh gets the hatch fill material and an outline.
 * Call it in an effect; it returns a function that removes the outlines and frees their geometry
 * (the model itself belongs to the loader cache). `mats` is `useWorld().mats`.
 */
export function hatch(root, mats, { fill = 'main', line = 'thick', threshold = 20 } = {}) {
  const added = [];
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    if (fill) mesh.material = mats.fills[fill];
    if (!line) return;
    const material = mats.lines[line];
    const edges = new THREE.EdgesGeometry(mesh.geometry, threshold);
    let outline;
    if (material.isLineMaterial) {
      outline = new LineSegments2(new LineSegmentsGeometry().fromEdgesGeometry(edges), material);
      edges.dispose();
    } else outline = new THREE.LineSegments(edges, material);
    mesh.add(outline);
    added.push(outline);
  });
  return () => { for (const o of added) { o.removeFromParent(); o.geometry.dispose(); } };
}
