import { z } from 'zod';

/** Two-door wardrobe (origin = floor centre, doors face +Z). */
export const wardrobe = {
  schema: z.strictObject({
    width: z.number().positive().default(2.4),
    height: z.number().positive().default(4.2),
    depth: z.number().positive().default(1.2),
    openOnFocus: z.boolean().default(true),
    openAngle: z.number().min(0).max(180).default(105),
  }),
  hotspots: ['doors'],
  placement: p => ({ focus: [0, p.height * 0.5, 0], cameraDistance: Math.max(6, p.height * 1.9), cameraHeight: p.height * 0.58, markerOffset: [0, p.height + 0.7, 0] }),
};
