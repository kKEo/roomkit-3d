import * as React from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { Solid, Segs, Outline, useGeometry, useWorld, useHotspot, shapeArgs } from '../scene/core.js';
import { useStore, runtime } from '../state/store.js';
import { toRad, circlePts } from '../lib/math.js';
import { META_SDK } from './metaSdk.js';
import { useShared, useSharedOwner, getShared, setShared, toggleShared } from '../net/shared.js';

/**
 * The part of a scene prefab's SDK that needs no browser: React, three.js, React Three Fiber's hooks and the app's
 * building blocks. `makeSdk` (./sdk.js) adds what only a page can give (screens, loaders, the visitor's motion
 * preference); the scene tools add stand-ins for those and render a prefab in Node (src/lint/stage.js).
 * `SDK_BROWSER_KEYS` names what each of the two must add, and test/stage.test.js holds them to it.
 */
export const SDK_BROWSER_KEYS = ['ScreenSurface', 'reducedMotion', 'useLoader', 'useGLTF', 'useModel', 'useTexture'];

export function sdkCore(moduleUrl) {
  return {
    ...META_SDK,
    // React
    React,
    h: React.createElement,
    useState: React.useState, useRef: React.useRef, useEffect: React.useEffect, useMemo: React.useMemo, useCallback: React.useCallback,
    // three.js and React Three Fiber
    THREE,
    useFrame, useThree, GLTFLoader,
    // the app's building blocks (see src/scene/core.js)
    Solid, Segs, Outline, useGeometry, shapeArgs,
    useWorld, useHotspot, useStore, runtime, toRad, circlePts,
    // state shared by everyone in an event (src/net/shared.js)
    useShared, useSharedOwner, getShared, setShared, toggleShared,
    // the prefab's own files
    moduleUrl,
    assetUrl: rel => new URL(rel, moduleUrl).href,
    hatch,
  };
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
