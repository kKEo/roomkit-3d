import { z } from 'zod';

/** Row of server cabinets with LEDs and ceiling cables behind a four-panel bi-fold door (origin = floor centre of the row, fronts face +Z). */
export const serverRack = {
  schema: z.strictObject({
    count: z.number().int().positive().default(4),
    height: z.number().positive().default(5.2),
    cables: z.boolean().default(true),
    /** where the cables end; default the room height */
    ceiling: z.number().positive().nullable().default(null),
    /** the bi-fold door folds open while the POI's panel is shown */
    openOnFocus: z.boolean().default(true),
    /** how far the outer panels swing out, in degrees; 90 folds each pair flat against the frame */
    openAngle: z.number().min(0).max(90).default(85),
  }),
  hotspots: ['rack', 'doors'],
  placement: p => ({ focus: [0, 2.8, 0], cameraDistance: 9.2, cameraHeight: 3.1, markerOffset: [0, p.height + 0.7, 1.4] }),
};
