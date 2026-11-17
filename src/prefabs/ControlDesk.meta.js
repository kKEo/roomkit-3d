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
  geometry: p => {
    const a = (p.arc / 2) * Math.PI / 180, R = p.radius;
    const cols = Math.max(1, p.columns), rows = Math.max(1, Math.ceil(p.screens.length / cols));
    const hx = Math.max(R * Math.sin(a) + 0.55, (cols * (p.screenWidth + 0.1)) / 2 + 0.1);
    return { min: [-hx, 0, -1.0], max: [hx, 1.65 + rows * (p.screenHeight + 0.1), Math.max(R * (1 - Math.cos(a)) + 0.55, p.chairs ? 1.6 : 0.55)], mount: 'floor' };
  },
  placement: p => {
    const rows = Math.max(1, Math.ceil(p.screens.length / Math.max(1, p.columns)));
    const top = 1.65 + rows * (p.screenHeight + 0.1);
    return { focus: [0, (1.65 + top) / 2, -0.85], cameraDistance: 9.5, cameraHeight: 3.2, markerOffset: [0, top + 0.55, -0.85] };
  },
};
