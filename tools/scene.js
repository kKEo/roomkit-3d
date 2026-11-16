#!/usr/bin/env node
/**
 * Scene tools for authors and coding agents: check a scene folder without opening a browser.
 *
 *   node tools/scene.js check [scene…] [--json] [--strict]   every problem in the scene, one per line
 *   node tools/scene.js describe <scene>                     the scene in words: where things stand, what each camera sees
 *   node tools/scene.js plan <scene> [--svg=file.svg]        the floor plan as text, or as an SVG file
 *   node tools/scene.js prefabs [scene]                      the object types a scene can place, with sizes and props
 *   node tools/scene.js keys [section]                       every key a scene's files can hold: type, default, meaning
 *   node tools/scene.js prefab new <scene> <type> [--mount=floor|wall|ceiling|free] [--title="…"]   a new object type for a scene
 *   node tools/scene.js prefab check <scene> [type]          render a scene's own types without a browser and list what is wrong
 *   node tools/scene.js prefab describe <scene> <type> [--props='{…}'] [--svg=file.svg]   its parts, sizes and outline
 *   node tools/scene.js prefab catalog <scene>               write prefabs/catalog.json from the scene's own types
 *   node tools/scene.js showroom <scene>                     turn the scene into a room that shows each of its own types on a stop
 *   node tools/scene.js shots <scene> [--views=a,b] [--out=file.png] [--size=640x360] [--measure]   pictures from the real viewer, on one sheet
 *   node tools/scene.js new <name> [--title="My Room"] [--brief="…"]   a new scene folder with one stop, listed in scenes/index.json
 *
 * With no scene name, every folder in public/scenes is checked. Exit code: 0 clean, 1 problems
 * (errors; with --strict also warnings), 2 wrong usage.
 */
process.removeAllListeners('warning'); // Node's localStorage notice, raised by a browser-side import

// What each command does lives in ./scene/commands.js, shared with the MCP server (tools/mcp.js); this file reads
// the command line, prints what comes back and sets the exit code.
const { writeFile } = await import('node:fs/promises');
const cmds = await import('./scene/commands.js');
const { splitViews } = await import('../src/lib/still.js');

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')).map(a => a.split('=')[0]));
const option = name => args.find(a => a.startsWith(`${name}=`))?.slice(name.length + 1);
const [cmd, ...names] = args.filter(a => !a.startsWith('--'));

const USAGE = `usage: node tools/scene.js <command> [scene…]

  check [scene…] [--json] [--strict]   list every problem (config, references, positions, cameras)
  describe <scene>                     read the scene back in words, to compare with the brief it was built from
  plan <scene> [--svg=file.svg]        draw the floor plan as text, or write it as SVG
  prefabs [scene]                      list the object types with their sizes, props and clickable parts
  keys [section]                       list every key of a scene's files with its type, default and meaning
  prefab new <scene> <type> [--mount=floor|wall|ceiling|free] [--title="Sofa"]
                                       start an object type of the scene's own: prefabs/<type>.js, declared in scene.json
  prefab check <scene> [type]          render the scene's own types without a browser: size, mount, clickable parts, motion
  prefab describe <scene> <type> [--props='{"height":2}'] [--svg=file.svg]
                                       read one back: its parts, measured size and outline from the front, the side and above
  prefab catalog <scene>               write prefabs/catalog.json, the list the editor offers the scene's own types from
  showroom <scene>                     lay the scene out as a gallery of its own types: a stop, a page and a camera for each
  shots <scene> [--views=overview,<stop>,top,x,y,z,tx,ty,tz] [--out=file.png] [--size=640x360] [--measure]
                                       take pictures with the real viewer in a headless browser: the whole room and
                                       each stop on one labelled sheet (needs Playwright's Chromium; takes seconds)
  new <name> [--title="My Room"] [--brief="what was asked for"]
                                       start a scene folder (a room and one stop) and list it in scenes/index.json

Scenes are the folders in public/scenes; with none named, all are used.`;

function fail(message) {
  console.error(message);
  process.exit(2);
}
/** The one scene a command is about. */
const one = () => (names.length === 1 ? names[0] : fail(`${cmd} takes one scene name`));
/** A flag that needs a value: the value, undefined when the flag is absent; `hint` is said when it is bare. */
const valued = (name, hint) => (flags.has(name) ? option(name) || fail(hint) : undefined);

/** Each resolves to what the command gave back, `{ lines, code? }`; its lines are printed and its code is the exit code. */
const commands = {
  async check() {
    const r = await cmds.check({ scenes: names, strict: flags.has('--strict') });
    return flags.has('--json') ? { lines: [JSON.stringify(r.findings, null, 2)], code: r.code } : r;
  },
  describe: () => cmds.describe({ scene: one() }),
  async plan() {
    const file = valued('--svg', 'give the file to write: --svg=plan.svg');
    const r = await cmds.plan({ scene: one(), svg: !!file });
    if (!file) return r;
    await writeFile(file, r.svg);
    return { lines: [`wrote ${file}`] };
  },
  prefabs: () => (names.length > 1 ? fail('prefabs takes at most one scene name') : cmds.prefabs({ scene: names[0] ?? null })),
  keys: () => (names.length > 1 ? fail('keys takes at most one section') : cmds.keys({ section: names[0] ?? null })),
  new() {
    if (names.length !== 1) fail('new takes one scene name');
    return cmds.newScene({ name: names[0], title: option('--title') ?? null, brief: valued('--brief', 'give the description: --brief="a gallery with three pictures on the north wall"') ?? null });
  },
  async prefab() {
    const [sub, scene, type, ...more] = names;
    const subs = { new: 'prefab new <scene> <type>', check: 'prefab check <scene> [type]', describe: 'prefab describe <scene> <type>', catalog: 'prefab catalog <scene>' };
    if (!Object.hasOwn(subs, sub ?? '')) fail(`prefab takes one of: ${Object.values(subs).join(', ')}`);
    if (!scene || more.length || (!type && sub !== 'check' && sub !== 'catalog') || (type && sub === 'catalog')) fail(`usage: node tools/scene.js ${subs[sub]}`);
    if (sub === 'new') return cmds.prefabNew({ scene, type, mount: option('--mount') ?? 'floor', title: option('--title') });
    if (sub === 'check') return cmds.prefabCheck({ scene, type: type ?? null, strict: flags.has('--strict') });
    if (sub === 'catalog') return cmds.prefabCatalog({ scene });
    let props = null;
    if (flags.has('--props')) {
      try { props = JSON.parse(option('--props') ?? ''); } catch (e) { fail(`--props must be JSON, such as --props='{"height":2}' (${e.message})`); }
    }
    const file = valued('--svg', 'give the file to write: --svg=lamp.svg');
    const r = await cmds.prefabDescribe({ scene, type, props });
    if (!file || !r.svg) return r;
    await writeFile(file, r.svg);
    return { lines: [...r.lines, '', `wrote ${file}`] };
  },
  showroom: () => cmds.showroom({ scene: one() }),
  shots() {
    const scene = one(), size = (option('--size') ?? '640x360').split('x').map(Number);
    const views = flags.has('--views') ? splitViews(option('--views')) : null;
    if (views && !views.length) fail('name the views: --views=overview,studio (overview, top, a stop\'s id, or a pose x,y,z,tx,ty,tz)');
    return cmds.shots({ scene, views, size, out: valued('--out', 'give the file to write: --out=loft.png'), measure: flags.has('--measure') });
  },
};

if (!cmd || flags.has('--help')) { console.log(USAGE); process.exit(cmd ? 0 : 2); }
if (!Object.hasOwn(commands, cmd)) fail(`unknown command "${cmd}"\n\n${USAGE}`);
try {
  const r = await commands[cmd]();
  if (r.lines.length) console.log(r.lines.join('\n'));
  process.exitCode = r.code ?? 0;
} catch (e) {
  if (!(e instanceof cmds.UsageError)) throw e;
  fail(e.message);
}
