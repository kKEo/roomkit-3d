import { z } from 'zod';
import { screenSchema } from './screenSchema.js';

/** Curved control-centre console with a wall of screens (origin = floor at the middle of the desk). */
export const controlDesk = {
  schema: z.strictObject({
    radius: z.number().positive().default(4),
    arc: z.number().min(1).max(180).default(70),
    segments: z.number().int().positive().default(3),
    chairs: z.number().int().min(0).default(2),
    columns: z.number().int().positive().default(3),
    screenWidth: z.number().positive().default(1.6),
    screenHeight: z.number().positive().default(0.95),
    screens: z.array(screenSchema).default(() => Array.from({ length: 6 }, () => screenSchema.parse({}))),
    /** a master switch on the console: `key` is the shared state it flips (everyone in an event sees it), `on` what it starts as */
    switch: z.strictObject({ key: z.string().min(1).max(200), label: z.string().optional(), on: z.boolean().default(true) }).nullable().default(null),
  }),
  media: ['screens[].src'],
  hotspots: p => [...p.screens.map((s, k) => s.id ?? `scr${k}`), ...(p.switch ? ['switch'] : [])],
  placement: p => {
    const rows = Math.max(1, Math.ceil(p.screens.length / Math.max(1, p.columns)));
    const top = 1.65 + rows * (p.screenHeight + 0.1);
    return { focus: [0, (1.65 + top) / 2, -0.85], cameraDistance: 9.5, cameraHeight: 3.2, markerOffset: [0, top + 0.55, -0.85] };
  },
};
