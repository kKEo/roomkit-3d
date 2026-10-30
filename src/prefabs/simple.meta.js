import { z } from 'zod';
import { SHAPES } from '../scene/shapes.js';

const LINES = ['thick', 'mid', 'thin', 'faint', 'glow'];

/** Door frame in a wall (origin = wall surface at floor level, facing +Z). */
export const door = {
  schema: z.strictObject({
    width: z.number().positive().default(2.4),
    height: z.number().positive().default(4.2),
  }),
  hotspots: ['door'],
  placement: p => ({ focus: [0, p.height / 2, 0], cameraDistance: 7, cameraHeight: 3, markerOffset: [0, p.height + 0.6, 0.3] }),
};

/** Plain bench / low block (origin = floor centre). */
export const bench = {
  schema: z.strictObject({
    width: z.number().positive().default(5.6),
    height: z.number().positive().default(0.7),
    depth: z.number().positive().default(0.9),
  }),
  hotspots: ['bench'],
  placement: p => ({ focus: [0, p.height, 0], cameraDistance: 5, cameraHeight: 2.5, markerOffset: [0, p.height + 1.2, 0] }),
};

/** Any basic shape (origin = the shape's centre). */
export const primitive = {
  schema: z.strictObject({
    shape: z.enum(SHAPES).default('box'),
    /** approximate bounding size; `args` derived from it unless given */
    size: z.number().positive().default(1),
    /** raw three.js geometry constructor arguments for `shape` */
    args: z.array(z.number()).nullable().default(null),
    fill: z.union([z.enum(['main', 'fine']), z.literal(false)]).default('main'),
    edge: z.union([z.enum(LINES), z.literal(false)]).default('thick'),
    spin: z.number().default(0),
    float: z.number().min(0).default(0),
  }),
  hotspots: ['shape'],
  placement: () => ({ focus: [0, 0, 0], cameraDistance: 6, cameraHeight: null, markerOffset: [0, 1.4, 0] }),
};
