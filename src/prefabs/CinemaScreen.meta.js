import { z } from 'zod';
import { SCREEN_SOURCES } from './screenSchema.js';

/** Big wall screen with stage and speakers (origin = wall surface at floor level, facing +Z). */
export const cinemaScreen = {
  schema: z.strictObject({
    width: z.number().positive().default(10),
    height: z.number().positive().default(5.6),
    elevation: z.number().default(4.3),
    source: z.enum(SCREEN_SOURCES).default('rain'),
    src: z.string().nullable().default(null),
    stage: z.boolean().default(true),
    speakers: z.boolean().default(true),
    zoom: z.boolean().default(true),
  }),
  media: ['src'],
  hotspots: ['screen'],
  placement: p => ({ focus: [0, p.elevation - 0.2, 0], cameraDistance: 12, cameraHeight: 3.4, markerOffset: [0, p.elevation + p.height / 2 + 0.65, 0.8] }),
};
