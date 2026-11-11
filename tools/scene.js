#!/usr/bin/env node
/**
 * Scene tools for authors and coding agents: check a scene folder without opening a browser.
 *
 *   node tools/scene.js check [scene…] [--json] [--strict]   every problem in the scene, one per line
 *   node tools/scene.js describe <scene>                     the scene in words: where things stand, what each camera sees
 *   node tools/scene.js plan <scene> [--svg=file.svg]        the floor plan as text, or as an SVG file
 *   node tools/scene.js prefabs [scene]                      the object types a scene can place, with sizes and props
 *
 * With no scene name, every folder in public/scenes is checked. Exit code: 0 clean, 1 problems
 * (errors; with --strict also warnings), 2 wrong usage.
 */
process.removeAllListeners('warning'); // Node's localStorage notice, raised by a browser-side import

const { writeFile } = await import('node:fs/promises');
const { checkScene, loadScene, sceneNames } = await import('./scene/load.js');
const { describeScene, describePrefabs } = await import('../src/lint/describe.js');
const { planText, planSvg } = await import('../src/lint/plan.js');
const { BUILTIN_REGISTRY } = await import('../src/prefabs/registry.js');
const { formatFinding } = await import('../src/lint/rules.js');

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')).map(a => a.split('=')[0]));
const option = name => args.find(a => a.startsWith(`${name}=`))?.slice(name.length + 1);
const [cmd, ...names] = args.filter(a => !a.startsWith('--'));

const USAGE = `usage: node tools/scene.js <command> [scene…]

  check [scene…] [--json] [--strict]   list every problem (config, references, positions, cameras)
  describe <scene>                     read the scene back in words, to compare with the brief it was built from
  plan <scene> [--svg=file.svg]        draw the floor plan as text, or write it as SVG
  prefabs [scene]                      list the object types with their sizes, props and clickable parts

Scenes are the folders in public/scenes; with none named, all are used.`;

async function targets() {
  const { dirs } = await sceneNames();
  const unknown = names.filter(n => !dirs.includes(n));
  if (unknown.length) fail(`no scene folder "${unknown[0]}" in public/scenes (there are: ${dirs.join(', ')})`);
  return names.length ? names : dirs;
}

function fail(message) {
  console.error(message);
  process.exit(2);
}

/** One scene that builds, for the commands that need positions. */
async function built() {
  if (names.length !== 1) fail(`${cmd} takes one scene name`);
  await targets();
  const loaded = await loadScene(names[0]);
  if (!loaded.scene || loaded.errors.length) fail(`${names[0]} has config errors; run: node tools/scene.js check ${names[0]}`);
  return loaded;
}

const commands = {
  async describe() {
    const { scene, pois } = await built();
    console.log(describeScene(scene, pois).join('\n'));
  },
  async plan() {
    const { scene, pois } = await built();
    const svg = option('--svg');
    if (flags.has('--svg') && !svg) fail('give the file to write: --svg=plan.svg');
    if (svg) { await writeFile(svg, planSvg(scene, pois)); console.log(`wrote ${svg}`); } else console.log(planText(scene, pois).join('\n'));
  },
  async prefabs() {
    if (names.length > 1) fail('prefabs takes at most one scene name');
    const registry = names.length ? (await built()).scene.registry : BUILTIN_REGISTRY;
    console.log(describePrefabs(registry).join('\n'));
  },
  async check() {
    const strict = flags.has('--strict'), all = [];
    let bad = false;
    for (const name of await targets()) {
      const { findings } = await checkScene(name);
      all.push(...findings.map(f => ({ scene: name, ...f })));
      const count = level => findings.filter(f => f.level === level).length;
      if (count('error') || (strict && count('warn'))) bad = true;
      if (flags.has('--json')) continue;
      for (const f of findings) console.log(formatFinding(f));
      console.log(`${name}: ${findings.length ? `${count('error')} errors, ${count('warn')} warnings, ${count('info')} notes` : 'ok'}`);
    }
    if (flags.has('--json')) console.log(JSON.stringify(all, null, 2));
    process.exitCode = bad ? 1 : 0;
  },
};

if (!cmd || flags.has('--help')) { console.log(USAGE); process.exit(cmd ? 0 : 2); }
if (!Object.hasOwn(commands, cmd)) fail(`unknown command "${cmd}"\n\n${USAGE}`);
await commands[cmd]();
