import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The scene tool as an author or an agent runs it: output and exit codes. */
const tool = join(import.meta.dirname, '..', 'tools', 'scene.js');
const runIn = env => (...args) => new Promise(resolve => {
  execFile(process.execPath, [tool, ...args], { env: { ...process.env, ...env } }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
});
const run = runIn({});

describe('tools/scene.js', () => {
  it('check prints one summary line per clean scene and exits 0', async () => {
    const r = await run('check', 'loft');
    expect(r).toEqual({ code: 0, stdout: 'loft: ok, 14 expectations hold\n', stderr: '' }); // the loft has a brief.json
    expect(await run('check', 'gallery')).toEqual({ code: 0, stdout: 'gallery: ok\n', stderr: '' });
    expect(JSON.parse((await run('check', 'loft', '--json')).stdout)).toEqual([]);
  });

  it('keys lists the sections, prints one, and refuses one it does not have', async () => {
    expect((await run('keys')).stdout).toMatch(/^sections .*\n {2}scene +the top level of scene\.json/);
    expect((await run('keys', 'room')).stdout).toMatch(/^scene\.json › room\n {2}width: number > 0 = 30 — metres east–west/);
    const r = await run('keys', 'walls');
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^no section "walls" \(there are: scene, room, theme, /);
  });

  it('new --brief starts a scene with its brief; a broken expectation fails the check and is named', async () => {
    const root = await mkdtemp(join(tmpdir(), 'roomkit-scenes-'));
    try {
      await writeFile(join(root, 'index.json'), '{ "default": "demo", "scenes": [] }\n');
      const sandbox = runIn({ ROOMKIT_SCENES: root });
      const made = await sandbox('new', 'demo', '--brief=A plinth in the middle of the room.');
      expect(made.stdout).toMatch(/^created public\/scenes\/demo \(scene\.json, poi\/start\.json, content\/start\.md, brief\.json\)/);
      expect(JSON.parse(await readFile(join(root, 'demo', 'brief.json'), 'utf8'))).toEqual({ text: 'A plinth in the middle of the room.', expect: [] });
      expect(JSON.parse(await readFile(join(root, 'index.json'), 'utf8')).scenes).toEqual(['demo']);
      expect((await sandbox('describe', 'demo')).stdout.split('\n')[1]).toBe('brief: A plinth in the middle of the room.');

      const poi = JSON.parse(await readFile(join(root, 'demo', 'poi', 'start.json'), 'utf8'));
      poi.objects[0].name = 'plinth';
      await mkdir(join(root, 'demo', 'poi'), { recursive: true });
      await writeFile(join(root, 'demo', 'poi', 'start.json'), JSON.stringify(poi));
      await writeFile(join(root, 'demo', 'brief.json'), JSON.stringify({ text: 'A plinth in the middle of the room.', expect: [{ object: 'plinth', centre: true }, { object: 'plinth', wall: 'north' }] }));
      const r = await sandbox('check', 'demo');
      expect(r.code).toBe(1);
      expect(r.stdout).toBe([
        'error EXPECT_FAILED  demo/brief.json › expect.1: "plinth" is 7.6 m from the north wall, not within 0.1 m (the brief expects {"object":"plinth","wall":"north"}; change the scene, or the expectation if the brief changed)',
        'demo: 1 errors, 0 warnings, 0 notes, 1 of 2 expectations hold',
        '',
      ].join('\n'));
      expect((await sandbox('new', 'other', '--brief')).stderr).toMatch(/^give the description: --brief=/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('describe, plan and prefabs print the scene', async () => {
    expect((await run('describe', 'loft')).stdout).toMatch(/^loft: "Cyan Loft/);
    expect((await run('plan', 'loft')).stdout).toMatch(/north is up, east is right/);
    expect((await run('prefabs', 'loft')).stdout).toMatch(/^lamp: /m);
    expect((await run('prefabs')).stdout).not.toMatch(/^lamp: /m);
  });

  it('wrong usage exits 2 and says what is known', async () => {
    expect((await run()).code).toBe(2);
    expect((await run('frobnicate')).stderr).toMatch(/unknown command "frobnicate"/);
    const r = await run('check', 'nowhere');
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/no scene folder "nowhere" in public\/scenes \(there are: .*\bloft\b.*\)/);
    expect((await run('new', 'Bad/Name')).stderr).toMatch(/is not a scene name/);
    expect((await run('new', 'loft')).stderr).toMatch(/already exists/);
  });
});
