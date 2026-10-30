import { z } from 'zod';
import { SHAPES } from '../scene/shapes.js';

/** Wall-mounted frame (origin = wall surface at the frame centre, facing +Z). */
export const pictureFrame = {
  schema: z.strictObject({
    width: z.number().positive().default(2.9),
    height: z.number().positive().default(2.1),
    image: z.string().nullable().default(null),
    exhibit: z.enum(SHAPES).nullable().default(null),
    caption: z.boolean().default(true),
    zoom: z.boolean().default(true),
  }),
  media: ['image'],
  hotspots: ['frame', 'image'],
  placement: p => ({ focus: [0, 0, 1.3], cameraDistance: 7, cameraHeight: null, markerOffset: [0, p.height / 2 + 0.7, 0.6] }),
};
