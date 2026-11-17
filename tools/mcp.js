#!/usr/bin/env node
/**
 * The scene tools as an MCP server, for agents that have no shell and no files of their own (a chat client, a
 * desktop app). It speaks MCP over stdio and offers what `tools/scene.js` does, one tool per job, plus reading
 * and writing a scene's text files:
 *
 *   node tools/mcp.js
 *
 * Every tool is a thin wrapper over a function in tools/scene/commands.js, the same one the command line calls,
 * so the two cannot drift. A scene's files can only be written inside its own folder in public/scenes (or in
 * `ROOMKIT_SCENES`, for a sandbox); `.mcp.json` at the repository root registers the server for agents working here.
 */
process.removeAllListeners('warning'); // Node's localStorage notice, raised by a browser-side import

const { readFile, realpath } = await import('node:fs/promises');
const { join } = await import('node:path');
const { McpServer } = await import('@modelcontextprotocol/server');
const { z } = await import('zod');
const cmds = await import('./scene/commands.js');
const { SECTIONS } = await import('../src/lint/keys.js');
const { MOUNT_NAMES } = await import('../src/lint/prefabDescribe.js');

const REPO = join(import.meta.dirname, '..');
const VERSION = JSON.parse(await readFile(join(REPO, 'package.json'), 'utf8')).version;

/** What a client is told when it connects: what this is, and the one thing to do first. */
export const INSTRUCTIONS = [
  'RoomKit 3D shows a walkable 3D room built from data files. A scene is one folder: scene.json (the room, theme and scenery), one poi/<id>.json per stop of the tour, and a Markdown page per stop.',
  'With these tools you can build or change a whole scene, or a set of new object types, from a description, and prove the result without a browser.',
  'Call `guide` first: it explains the coordinates, the files and the loop (write, check, read back, look).',
  'Write files with `scene_write`; it answers with every problem the scene has, each with the file, the key and what to do. Work until it says "ok".',
].join(' ');

/** How the skills' shell commands map onto this server's tools: the guide opens with it. */
const TOOL_MAP = [
  'This guide was written for an agent with a shell. Here, use the tools of this server in place of the commands it names:',
  '  node tools/scene.js check <scene> → scene_check          describe → scene_describe      plan → scene_plan',
  '  prefabs → prefab_list      keys → scene_keys      new → scene_new      shots → scene_shots      showroom → showroom',
  '  prefab new / check / describe → prefab_new / prefab_check / prefab_describe',
  'Read a scene\'s files with scene_read and write them with scene_write, one whole file at a time; scene_write answers with the check, so there is no need to call scene_check after it.',
  '',
].join('\n');

const SKILLS = { scene: 'build-scene', prefab: 'build-prefab' };

/** The guide for a topic: the orientation every agent starts from, or one of the two skills with their shell commands mapped to tools. */
async function guide(topic) {
  if (topic === 'start') return { lines: [TOOL_MAP + (await readFile(join(REPO, 'AGENTS.md'), 'utf8')), '', 'Next: guide with topic "scene" before building or changing a scene; topic "prefab" before writing a new object type.'] };
  const text = await readFile(join(REPO, '.claude', 'skills', SKILLS[topic], 'SKILL.md'), 'utf8').catch(() => null);
  if (text == null) throw new cmds.UsageError(`there is no guide for "${topic}" in this copy of the repository`);
  return { lines: [TOOL_MAP + text.replace(/^---\n[\s\S]*?\n---\n/, '')] };
}

/** A new server with every tool registered. One per connection: `serveStdio` and the tests both call this. */
export function createServer() {
  const server = new McpServer({ name: 'roomkit', version: VERSION }, { instructions: INSTRUCTIONS });

  /** Registers a tool whose handler is one of the command functions: its lines become the answer, a `UsageError` an error result. */
  const tool = (name, { title, description, input = {}, readOnly = false, destructive = false }, run) => {
    server.registerTool(name, {
      title, description, inputSchema: z.object(input),
      annotations: { readOnlyHint: readOnly, destructiveHint: destructive, idempotentHint: readOnly, openWorldHint: false },
    }, async args => {
      try {
        const r = await run(args);
        return { content: [...(r.image ? [{ type: 'image', data: r.image, mimeType: 'image/png' }] : []), { type: 'text', text: r.lines.join('\n') }] };
      } catch (e) {
        if (!(e instanceof cmds.UsageError)) throw e;
        return { content: [{ type: 'text', text: e.message }], isError: true };
      }
    });
  };
  const scene = z.string().describe('the scene\'s folder name in public/scenes, as scene_list gives it');

  tool('guide', {
    title: 'How to build a scene or an object type', readOnly: true,
    description: 'Read this before anything else. "start": the coordinates (metres, north is −Z, east is +X), what a scene folder holds and how objects are placed. "scene": the step-by-step loop for building or changing a scene from a description. "prefab": the loop for writing a new object type and a showroom for a set of them.',
    input: { topic: z.enum(['start', 'scene', 'prefab']).default('start').describe('which guide') },
  }, ({ topic }) => guide(topic));

  tool('scene_list', { title: 'List the scenes', readOnly: true, description: 'Every scene folder with its title and number of stops; the default scene is marked.' }, () => cmds.listScenes());

  tool('scene_read', {
    title: 'Read a scene\'s files', readOnly: true,
    description: 'Without `path`: the scene\'s files with their sizes. With `path`: the text of one file (scene.json, poi/<id>.json, content/<id>.md, brief.json, prefabs/<type>.js).',
    input: { scene, path: z.string().optional().describe('a file inside the scene folder, such as poi/desk.json') },
  }, ({ scene: s, path }) => cmds.readScene({ scene: s, path: path ?? null }));

  tool('scene_write', {
    title: 'Write one file of a scene',
    description: 'Creates or replaces one text file inside the scene folder (.json, .md, .js, .svg, .txt, .csv) with the whole text given, then answers with the scene\'s check: every problem as "level CODE file › key: what is wrong (what to do)", and a last line that is "<scene>: ok" when nothing is left. Write, read the answer, fix, write again.',
    input: { scene, path: z.string().describe('where in the scene folder, such as poi/desk.json'), text: z.string().describe('the whole content of the file') },
  }, a => cmds.writeScene(a));

  tool('scene_remove', {
    title: 'Remove one file of a scene', destructive: true,
    description: 'Deletes one file from the scene folder, such as a stop that was renamed; never scene.json. Take the file out of scene.json › poi first if it is listed there. Answers with the scene\'s check.',
    input: { scene, path: z.string().describe('the file to delete, such as poi/start.json') },
  }, a => cmds.removeScene(a));

  tool('scene_new', {
    title: 'Start a new scene',
    description: 'Makes a scene folder with a 20 × 20 × 7 m room and one stop ("start", a pedestal), and lists it in scenes/index.json. With `brief`, the description it is to be built from is kept in the scene\'s brief.json, ready for its expectations.',
    input: {
      name: z.string().describe('the folder name: letters, digits, "-" and "_"'), title: z.string().optional().describe('the scene\'s title; default made from the name'),
      brief: z.string().optional().describe('the description the scene is to be built from, in the person\'s own words'),
    },
  }, a => cmds.newScene({ name: a.name, title: a.title ?? null, brief: a.brief ?? null }));

  tool('scene_check', {
    title: 'Check a scene', readOnly: true,
    description: 'Every problem in a scene, without a browser: config mistakes, missing files and broken references, objects outside the room or overlapping, cameras that do not see their stop, unreadable colours, the scene\'s own object types, and whether what its brief.json expects holds. One line each, with what to do. Without `scene`, every scene.',
    input: { scene: scene.optional(), strict: z.boolean().default(true).describe('count warnings as failures; leave it on while building') },
  }, ({ scene: s, strict }) => cmds.check({ scenes: s ? [s] : [], strict }));

  tool('scene_describe', {
    title: 'Read a scene back in words', readOnly: true,
    description: 'The scene as built: the room and its walls, then every object with where it stands (which wall, how far from it, what is nearest, which way it faces) and, for every stop, where its camera is and what fills its picture. Compare it line by line with what was asked for.',
    input: { scene },
  }, a => cmds.describe(a));

  tool('scene_plan', { title: 'Draw a scene\'s floor plan', readOnly: true, description: 'The floor plan as text, north up: walls, pillars, a letter per object and a digit where each stop\'s camera stands, with a legend.', input: { scene } }, a => cmds.plan(a));

  tool('scene_keys', {
    title: 'The keys a scene\'s files can hold', readOnly: true,
    description: `Every key with its type, default and one line of meaning, printed from the schemas that validate the files. Without \`section\`, the list of sections; with one of ${Object.keys(SECTIONS).join(', ')}, that section.`,
    input: { section: z.enum(Object.keys(SECTIONS)).optional() },
  }, a => cmds.keys({ section: a.section ?? null }));

  tool('scene_shots', {
    title: 'Take pictures of a scene', readOnly: true,
    description: 'Pictures from the real viewer in a headless browser: the whole room and one frame per stop on one labelled sheet, returned as an image. A few seconds. Use it last, when the check is clean and the read-back matches, to see whether it looks right. Needs Playwright\'s Chromium on the machine that runs this server.',
    input: {
      scene, views: z.array(z.string()).optional().describe('which views: "overview", "top", a stop\'s id, or a pose "x,y,z,tx,ty,tz"; default the overview and every stop'),
      width: z.number().int().min(160).max(1920).default(640).describe('one frame\'s width in pixels'), height: z.number().int().min(90).max(1080).default(360),
      measure: z.boolean().default(false).describe('also hold every object\'s drawn parts against the box its type declares'),
    },
  }, async a => {
    const r = await cmds.shots({ scene: a.scene, views: a.views ?? null, size: [a.width, a.height], measure: a.measure });
    return r.file ? { ...r, image: (await readFile(r.file)).toString('base64') } : r;
  });

  tool('prefab_list', {
    title: 'The object types that can be placed', readOnly: true,
    description: 'Every object type with what it is, whether it stands on the floor or hangs on a wall, its size with default props, each prop with its type, default and limits, and its clickable parts. With `scene`, that scene\'s own types as well. Use these sizes; do not guess them.',
    input: { scene: scene.optional() },
  }, a => cmds.prefabs({ scene: a.scene ?? null }));

  tool('prefab_new', {
    title: 'Start a new object type',
    description: 'Writes prefabs/<type>.js into the scene from a template (one box that follows three size props) and declares it in scene.json › prefabs. It passes prefab_check as it stands; read it with scene_read, give it its real parts, write it back with scene_write.',
    input: {
      scene, type: z.string().describe('the type\'s name: letters, digits and "_", starting with a lowercase letter, such as sideTable'),
      mount: z.enum(MOUNT_NAMES).default('floor').describe('what it sits on'), title: z.string().optional().describe('its name for people'),
    },
  }, a => cmds.prefabNew(a));

  tool('prefab_check', {
    title: 'Check a scene\'s own object types', readOnly: true,
    description: 'Renders each of the scene\'s own types without a browser, for its default props and with every prop changed in turn, and lists what is wrong: a part outside the box its meta declares, a floor object that floats, clickable parts the meta does not list, something that moves under reduced motion, a material of its own, a render that throws. With `type`, that one alone.',
    input: { scene, type: z.string().optional() },
  }, a => cmds.prefabCheck({ scene: a.scene, type: a.type ?? null, strict: true }));

  tool('prefab_describe', {
    title: 'Read an object type back', readOnly: true,
    description: 'What one of the scene\'s own types really makes: each part with its shape, size and place, the measured size against the declared one, what is clickable, what moves, and its outline drawn as text from the front, the side and above. Read it to tell whether the code builds the thing that was described.',
    input: { scene, type: z.string(), props: z.record(z.string(), z.any()).optional().describe('other props than the defaults, such as { "height": 3 }') },
  }, async a => { const r = await cmds.prefabDescribe({ scene: a.scene, type: a.type, props: a.props ?? null }); return { lines: r.lines }; });

  tool('showroom', {
    title: 'Make a showroom of a scene\'s own types',
    description: 'Turns the scene into a gallery of its own object types: a bay, a stop, a camera and a page for each, plus prefabs/catalog.json so the editor can offer them. It sets the room and the stop list in scene.json and leaves the rest as written. Safe to run again after adding or resizing a type.',
    input: { scene },
  }, a => cmds.showroom(a));

  return server;
}

// run as a program: serve one client over stdin and stdout
if (process.argv[1] && import.meta.filename === await realpath(process.argv[1]).catch(() => null)) {
  const { serveStdio } = await import('@modelcontextprotocol/server/stdio');
  serveStdio(createServer, { onerror: e => console.error(e) });
}
