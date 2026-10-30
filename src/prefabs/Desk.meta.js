import { z } from 'zod';
import { screenOrSource } from './screenSchema.js';

/** Desk with monitor, keyboard and chair (origin = floor centre; viewers stand at +Z). */
export const desk = {
  schema: z.strictObject({
    /** a source name ("rain", "image", …) or a full screen config, as for controlDesk screens */
    screen: screenOrSource.default('rain'),
    src: z.string().nullable().default(null),
    chair: z.boolean().default(true),
    zoom: z.boolean().default(true),
  }),
  media: ['src', 'screen.src'],
  hotspots: ['screen', 'chair'],
  placement: () => ({ focus: [0, 1.6, 0], cameraDistance: 6, cameraHeight: 2.9, markerOffset: [0, 2.8, 0] }),
};
