import { z } from 'zod';
import { screenSchema, screenOrSource, SCREEN_SOURCES } from './screenSchema.js';
import { SHAPES } from '../scene/shapes.js';
import { feedSchema } from '../data/feedSchema.js';

/**
 * What a scene-shipped prefab's `meta(sdk)` receives: the pieces it needs to describe its props.
 * No React or three.js here, so `meta()` runs the same in the browser and in Node (tests).
 * The rendering half is `makeSdk` in ./sdk.js.
 *
 * `version` is the SDK's: a prefab hosted outside the app may say what it was written for (`requires` in its
 * meta, a semver range such as `^1.0.0`), and the loader refuses a module the app cannot serve instead of
 * failing at render time. Bump the minor for added keys, the major for a key removed or changed in meaning.
 */
export const SDK_VERSION = '1.0.0';

export const META_SDK = Object.freeze({ version: SDK_VERSION, z, screenSchema, screenOrSource, SCREEN_SOURCES, SHAPES, feedSchema });
