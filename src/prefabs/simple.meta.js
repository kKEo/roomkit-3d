import { z } from 'zod';
import { SHAPES, shapeArgs, shapeExtent } from '../scene/shapes.js';

const LINES = ['thick', 'mid', 'thin', 'faint', 'glow'];

/** Door in a wall: frame plus clickable wing (origin = wall surface at floor level, facing +Z). */
export const door = {
  schema: z.strictObject({
    width: z.number().positive().default(2.4),
    height: z.number().positive().default(4.2),
  }),
  hotspots: ['door'],
  geometry: p => ({ min: [-p.width / 2 - 0.125, 0, 0], max: [p.width / 2 + 0.125, p.height + 0.245, 0.4], mount: 'wall' }),
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
  geometry: p => ({ min: [-p.width / 2, 0, -p.depth / 2], max: [p.width / 2, p.height, p.depth / 2], mount: 'floor' }),
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
  geometry: p => {
    const h = shapeExtent(p.shape, p.args ?? shapeArgs(p.shape, p.size));
    return h && { min: [-h[0], -h[1] - p.float, -h[2]], max: [h[0], h[1] + p.float, h[2]], mount: 'free' };
  },
  placement: () => ({ focus: [0, 0, 0], cameraDistance: 6, cameraHeight: null, markerOffset: [0, 1.4, 0] }),
};
