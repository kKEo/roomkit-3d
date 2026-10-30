import { z } from 'zod';

/** Row of server cabinets with LEDs and ceiling cables (origin = floor centre of the row, fronts face +Z). */
export const serverRack = {
  schema: z.strictObject({
    count: z.number().int().positive().default(4),
    height: z.number().positive().default(5.2),
    cables: z.boolean().default(true),
    /** where the cables end; default the room height */
    ceiling: z.number().positive().nullable().default(null),
  }),
  hotspots: ['rack'],
  placement: p => ({ focus: [0, 2.8, 0], cameraDistance: 9.2, cameraHeight: 3.1, markerOffset: [0, p.height + 0.7, 1.4] }),
};
