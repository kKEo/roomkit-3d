#!/usr/bin/env node
/**
 * Scene tools for authors and coding agents: check a scene folder without opening a browser.
 *
 *   node tools/scene.js check [scene…] [--json] [--strict]   every problem in the scene, one per line
 *
 * With no scene name, every folder in public/scenes is checked. Exit code: 0 clean, 1 problems
 * (errors; with --strict also warnings), 2 wrong usage.
 */
process.removeAllListeners('warning'); // Node's localStorage notice, raised by a browser-side import

const { checkScene, sceneNames } = await import('./scene/load.js');
const { formatFinding } = await import('../src/lint/rules.js');

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const [cmd, ...names] = args.filter(a => !a.startsWith('--'));

const USAGE = `usage: node tools/scene.js <command> [scene…]

  check [scene…] [--json] [--strict]   list every problem (config, references, positions, cameras)

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

const commands = {
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
