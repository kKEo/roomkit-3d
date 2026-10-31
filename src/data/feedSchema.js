import { z } from 'zod';

/**
 * Where a screen or a panel block gets live data from (no React here: the config loader imports it).
 *
 *   "feed": "data/nodes.json"
 *   "feed": { "url": "data/nodes.json", "refresh": 15, "stream": "https://…/sse", "transform": "nodes" }
 *
 * - `url`       JSON fetched when the screen/block appears, and again every `refresh` seconds if given
 * - `stream`    a Server-Sent Events URL; each message is a JSON value that replaces the last one
 * - `transform` the name of a function declared in `scene.json › transforms`; it turns the response into
 *               the screen's fields (or the block's `data`). Without it the response must already be that.
 *
 * Relative URLs are resolved against the scene folder when the feed starts (src/data/useFeed.js).
 * The parsed value is tagged with `FEED`, so the loader can find every feed in a scene whatever prop holds it.
 */
export const FEED = Symbol('feed');

/** A transform name: letters, digits and "_", starting with a lowercase letter (like a prefab type name). */
export const TRANSFORM_NAME = /^[a-z][a-zA-Z0-9_]*$/;

const transformName = z.string().regex(TRANSFORM_NAME, 'a transform name is letters, digits and "_", starting with a lowercase letter');

export const feedSchema = z.union([
  z.string().min(1).transform(url => ({ url })),
  z.strictObject({
    url: z.string().min(1).optional(),
    stream: z.string().min(1).optional(),
    refresh: z.number().min(1, 'refresh is in seconds, at least 1').optional(),
    transform: transformName.optional(),
  }).refine(f => f.url || f.stream, 'give url and/or stream'),
]).transform(f => ({ ...f, [FEED]: true }));

/** `scene.json › transforms`: transform name → module path (relative to the scene folder) or URL, `#export` optional. */
export const transformsDeclSchema = z.record(transformName, z.string().min(1, 'give the path or URL of the transform module'));

/** True for a value that came out of `feedSchema`. */
export const isFeed = v => v != null && typeof v === 'object' && v[FEED] === true;
