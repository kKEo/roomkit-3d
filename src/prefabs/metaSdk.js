import { z } from 'zod';
import { screenSchema, screenOrSource, SCREEN_SOURCES } from './screenSchema.js';
import { SHAPES } from '../scene/shapes.js';
import { feedSchema } from '../data/feedSchema.js';

/**
 * What a scene-shipped prefab's `meta(sdk)` receives: the pieces it needs to describe its props.
 * No React or three.js here, so `meta()` runs the same in the browser and in Node (tests).
 * The rendering half is `makeSdk` in ./sdk.js.
 */
export const META_SDK = Object.freeze({ z, screenSchema, screenOrSource, SCREEN_SOURCES, SHAPES, feedSchema });
