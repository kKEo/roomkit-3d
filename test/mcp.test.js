import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';

/**
 * The MCP server (tools/mcp.js) as a client meets it: over a sandbox scenes folder, so nothing shipped is touched.
 * The folder has to be named before the tools are loaded, which read `ROOMKIT_SCENES` once.
 */
const root = await mkdtemp(join(tmpdir(), 'roomkit-mcp-'));
process.env.ROOMKIT_SCENES = root;
await writeFile(join(root, 'index.json'), '{ "default": "demo", "scenes": [] }\n');
const { createServer, INSTRUCTIONS } = await import('../tools/mcp.js');

let client;
/** Calls a tool: `{ text, error, image }`. */
async function call(name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  return { text: r.content.filter(c => c.type === 'text').map(c => c.text).join('\n'), error: !!r.isError, image: r.content.some(c => c.type === 'image') };
}

beforeAll(async () => {
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '1.0.0' });
  await createServer().connect(serverEnd);
  await client.connect(clientEnd);
});
afterAll(async () => { await client.close(); delete process.env.ROOMKIT_SCENES; await rm(root, { recursive: true, force: true }); });

describe('the MCP server', () => {
  it('says what it is for and offers one tool per job, each described and marked read-only or not', async () => {
    expect(client.getInstructions()).toBe(INSTRUCTIONS);
    const { tools } = await client.listTools();
    expect(tools.map(t => t.name)).toEqual(['guide', 'scene_list', 'scene_read', 'scene_write', 'scene_remove', 'scene_new', 'scene_check', 'scene_describe', 'scene_plan', 'scene_keys', 'scene_shots', 'prefab_list', 'prefab_new', 'prefab_check', 'prefab_describe', 'showroom']);
    for (const t of tools) {
      expect(t.description.length, t.name).toBeGreaterThan(60);
      expect(t.title, t.name).toBeTruthy();
      expect(t.inputSchema.type, t.name).toBe('object');
    }
    const flag = key => tools.filter(t => t.annotations[key]).map(t => t.name);
    expect(flag('readOnlyHint')).toEqual(['guide', 'scene_list', 'scene_read', 'scene_check', 'scene_describe', 'scene_plan', 'scene_keys', 'scene_shots', 'prefab_list', 'prefab_check', 'prefab_describe']);
    expect(flag('destructiveHint')).toEqual(['scene_remove']);
    expect(tools.find(t => t.name === 'scene_write').inputSchema.required).toEqual(['scene', 'path', 'text']);
  });

  it('guides: the orientation with the commands mapped to tools, and each skill', async () => {
    const start = await call('guide');
    expect(start.text).toMatch(/^This guide was written for an agent with a shell\. Here, use the tools of this server/);
    expect(start.text).toContain('# Working in this repository');
    expect((await call('guide', { topic: 'scene' })).text).toContain('# Building a scene from a description');
    expect((await call('guide', { topic: 'scene' })).text).not.toMatch(/^---\nname:/m);
  });

  it('builds a scene: new, read, write with a mistake, fix, read back', async () => {
    expect((await call('scene_list')).text).toBe('no scenes yet');
    expect((await call('scene_new', { name: 'demo', title: 'Demo room', brief: 'A desk by the north wall.' })).text).toMatch(/^created public\/scenes\/demo \(scene\.json, poi\/start\.json, content\/start\.md, brief\.json\)/);
    expect((await call('scene_list')).text).toBe('demo (the default): "Demo room", 1 stop');
    expect((await call('scene_read', { scene: 'demo' })).text.split('\n')).toEqual([
      'public/scenes/demo: 4 files', expect.stringMatching(/^brief\.json {2}\d+ bytes$/), expect.stringMatching(/^content\/start\.md {2}\d+ bytes$/), expect.stringMatching(/^poi\/start\.json {2}\d+ bytes$/), expect.stringMatching(/^scene\.json {2}\d+ bytes$/),
    ]);
    expect(JSON.parse((await call('scene_read', { scene: 'demo', path: 'poi/start.json' })).text).id).toBe('start');

    // a misspelt key and a wall the room does not have: the answer is the check, not an error of the tool
    const desk = { id: 'desk', label: 'Desk', objects: [{ type: 'desk', name: 'desk', at: { wall: 'nrth' } }], content: { blocks: [{ type: 'heading', text: 'Desk' }] } };
    const wrong = await call('scene_write', { scene: 'demo', path: 'poi/desk.json', text: JSON.stringify(desk) });
    expect(wrong.error).toBe(false);
    expect(wrong.text).toBe('created public/scenes/demo/poi/desk.json\ndemo: ok'); // not in the tour yet, so nothing reads it
    const scene = JSON.parse(await readFile(join(root, 'demo', 'scene.json'), 'utf8'));
    const listed = await call('scene_write', { scene: 'demo', path: 'scene.json', text: JSON.stringify({ ...scene, poi: ['poi/desk.json'] }, null, 2) });
    expect(listed.text.split('\n')).toEqual([
      'replaced public/scenes/demo/scene.json',
      'error CONFIG  demo/poi/desk.json › objects.0.at.wall: a wall is "north", "south", "east", "west" or its number in room.footprint',
      'info  EXPECT_SKIPPED  demo/brief.json: the scene has config errors, so the brief was not checked',
      'demo: 1 errors, 0 warnings, 1 notes',
    ]);
    desk.objects[0].at.wall = 'north';
    await call('scene_write', { scene: 'demo', path: 'brief.json', text: JSON.stringify({ text: 'A desk by the north wall.', expect: [{ object: 'desk', wall: 'north' }, { object: 'desk', facing: 'south' }] }) });
    expect((await call('scene_write', { scene: 'demo', path: 'poi/desk.json', text: JSON.stringify(desk) })).text).toBe('replaced public/scenes/demo/poi/desk.json\ndemo: ok, 2 expectations hold');
    expect((await call('scene_remove', { scene: 'demo', path: 'poi/start.json' })).text).toBe('removed public/scenes/demo/poi/start.json\ndemo: ok, 2 expectations hold');

    expect((await call('scene_check', { scene: 'demo' })).text).toBe('demo: ok, 2 expectations hold');
    const read = (await call('scene_describe', { scene: 'demo' })).text.split('\n');
    expect(read.slice(0, 2)).toEqual(['demo: "Demo room"', 'brief: A desk by the north wall.']);
    expect(read.find(l => l.trim().startsWith('desk (desk:0)'))).toMatch(/against the north wall; placed at: north wall, 50% along$/);
    expect((await call('scene_plan', { scene: 'demo' })).text).toMatch(/^demo: north is up, east is right/);
  });

  it('keeps every file inside the scene folder, and to text', async () => {
    for (const path of ['../other/scene.json', '/etc/passwd', 'poi/../../x.json', '..', '']) {
      const r = await call('scene_write', { scene: 'demo', path, text: '{}' });
      expect([r.error, r.text], path).toEqual([true, expect.stringMatching(/is not a path inside the scene folder|name the file/)]);
    }
    expect(await call('scene_write', { scene: 'demo', path: 'media/photo.png', text: 'x' })).toMatchObject({ error: true, text: expect.stringMatching(/^media\/photo\.png: only \.json, \.md, \.js, \.svg, \.txt and \.csv files can be written/) });
    expect(await call('scene_read', { scene: 'demo', path: '../index.json' })).toMatchObject({ error: true });
    expect(await call('scene_read', { scene: 'demo', path: 'poi/nope.json' })).toMatchObject({ error: true, text: 'public/scenes/demo/poi/nope.json does not exist' });
    expect(await call('scene_remove', { scene: 'demo', path: 'scene.json' })).toMatchObject({ error: true, text: 'scene.json is the scene: it is not removed' });
    expect(await call('scene_check', { scene: 'attic' })).toMatchObject({ error: true, text: 'no scene folder "attic" in public/scenes (there are: demo)' });
    expect(await call('scene_new', { name: 'Bad/Name' })).toMatchObject({ error: true, text: '"Bad/Name" is not a scene name: use letters, digits, "-" and "_"' });
  });

  it('prints the keys and the object types', async () => {
    expect((await call('scene_keys')).text).toMatch(/^sections /);
    expect((await call('scene_keys', { section: 'at' })).text).toMatch(/^object › at: one of four forms/);
    expect((await call('prefab_list')).text).toMatch(/^pedestal: a plinth with an exhibit shape on top/);
  });

  it('builds a set of object types: new, check, read back, and a showroom that passes the strict check', async () => {
    await call('scene_new', { name: 'pack' });
    expect((await call('prefab_new', { scene: 'pack', type: 'sideTable', title: 'Side table' })).text).toMatch(/^created public\/scenes\/pack\/prefabs\/sideTable\.js \(a floor object, one box\)/);
    await call('prefab_new', { scene: 'pack', type: 'plaque', mount: 'wall' });
    expect((await call('prefab_check', { scene: 'pack' })).text).toBe('pack › 2 types: ok');
    expect((await call('prefab_describe', { scene: 'pack', type: 'sideTable', props: { height: 2 } })).text).toMatch(/^sideTable: "Side table", say in a line what it is\ndeclared: a floor object, faces \+z; 1 wide × 2 high × 1 deep/);
    expect(await call('prefab_describe', { scene: 'pack', type: 'sofa' })).toMatchObject({ error: true, text: 'pack has no type "sofa" of its own (it has: sideTable, plaque)' });

    // the module is changed through the same tool as any file, and the answer says what the change broke
    const source = (await call('scene_read', { scene: 'pack', path: 'prefabs/plaque.js' })).text;
    const broken = await call('scene_write', { scene: 'pack', path: 'prefabs/plaque.js', text: source.replace("hotspots: ['body']", "hotspots: ['body', 'lid']") });
    expect(broken.text).toMatch(/warn {2}PREFAB_HOTSPOT {2}pack\/prefabs\/plaque\.js › hotspots: the meta lists "lid", but no part has that name/);
    await call('scene_write', { scene: 'pack', path: 'prefabs/plaque.js', text: source });

    expect((await call('showroom', { scene: 'pack' })).text).toMatch(/^pack: a 12 × 12 m room, 7 m high, with 2 stops: sideTable, plaque/);
    expect((await call('scene_check', { scene: 'pack' })).text).toBe('pack: ok');
    expect((await call('prefab_list', { scene: 'pack' })).text).toMatch(/^sideTable: say in a line what it is$/m);
  });
});
