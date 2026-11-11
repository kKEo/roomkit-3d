import { z } from 'zod';
import { SHAPES } from '../scene/shapes.js';

/** Plinth with a floating, rotating solid (origin = floor centre). */
export const pedestal = {
  schema: z.strictObject({
    shape: z.enum(SHAPES).default('icosahedron'),
    height: z.number().positive().default(3),
    size: z.number().positive().default(1.2),
    rings: z.boolean().default(true),
  }),
  hotspots: ['solid'],
  geometry: p => {
    const k = p.size / 1.2, r = Math.max(2.3, p.rings ? 2.45 * k : p.size);
    return { min: [-r, 0, -r], max: [r, p.height + (p.rings ? 1.83 * k : p.size) + 0.12, r], mount: 'floor', round: true };
  },
  placement: p => ({ focus: [0, p.height - 0.1, 0], cameraDistance: 12.5, cameraHeight: 3.4, markerOffset: [0, p.height + 1.9, 0] }),
};
