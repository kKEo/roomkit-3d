# Working with coding agents

This page describes what the repository gives a coding agent (Claude Code, Codex, Cursor and the like) so that it can build a scene, or a set of new object types, from a description and prove the result without a person opening a browser. People use the same commands; nothing here is for agents only.

## The ladder

An agent that writes files has to find out whether they are right. Each rung below answers one question, and the cheap ones come first.

| Rung | Command | Costs | Answers |
| --- | --- | --- | --- |
| Facts | `prefabs`, `keys` | a few hundred tokens | what can I place, how big is it, which keys exist? |
| Check | `check <scene> --strict` | under a second, a few lines | is anything broken, impossible, or not what the brief expects? |
| Read back | `describe`, `plan`, `prefab describe` | under a second, some thirty lines | is it the room, or the object, that was asked for? |
| Look | `shots <scene>` | seconds, one picture | does it look right? |
| A person | the browser | minutes | taste: colour, motion, whether the text fits |

All of them are `node tools/scene.js <command>`; [Commands](commands.md) lists every one. Three ideas keep mistakes from being made in the first place:

- **Say where, not which numbers.** `"at": { "corner": "north-east" }`, `{ "near": "desk", "side": "front" }` and `"facing": "west"` replace coordinate and angle arithmetic ([POI file reference](../reference/poi-json.md#placing-in-words)).
- **The brief as something to run.** `brief.json` holds the description and what must therefore be true; `check` evaluates it on every run ([brief.json reference](../reference/brief-json.md)).
- **One source of facts.** `prefabs` and `keys` print from the code that validates the files, so there is no page to drift.

## Where an agent starts

| File | What it is |
| --- | --- |
| `AGENTS.md` (imported by `CLAUDE.md`) | the entry point: the commands, the coordinate rules, where things are |
| `.claude/skills/build-scene/` | the loop for building or changing a scene, with a worked example |
| `.claude/skills/build-prefab/` | the loop for writing a new object type, and a showroom for a set of them |
| `.claude/settings.json` | lets the scene tool run without asking each time |
| `.mcp.json` | registers the MCP server below for agents working in this repository |

A skill is plain Markdown with a short header; an agent that does not know the format can simply be pointed at the file.

## The MCP server

For a client without a shell or files of its own (a chat app, a desktop client), the same operations are offered over the [Model Context Protocol](https://modelcontextprotocol.io):

```sh
node tools/mcp.js        # speaks MCP over stdin and stdout
```

```json
{ "mcpServers": { "roomkit": { "command": "node", "args": ["/absolute/path/to/roomkit/tools/mcp.js"] } } }
```

Inside the repository the path may be relative, as in the `.mcp.json` that is checked in. The server needs the dev dependencies (`npm install`), as the tests do.

| Tool | Does | Changes files |
| --- | --- | --- |
| `guide` | the orientation (`AGENTS.md`) or one of the two skills, with their shell commands mapped to these tools | no |
| `scene_list`, `scene_read` | the scenes; a scene's files, or the text of one | no |
| `scene_write` | creates or replaces one text file in a scene folder, and answers with the scene's check | yes |
| `scene_remove` | deletes one file of a scene (never `scene.json`), and answers with the check | yes |
| `scene_new` | a new scene folder with a room and one stop; `brief` starts its `brief.json` | yes |
| `scene_check`, `scene_describe`, `scene_plan`, `scene_keys` | as the commands of the same names | no |
| `scene_shots` | the picture sheet, returned as an image | writes the picture to `tools/scene/out/` |
| `prefab_list`, `prefab_check`, `prefab_describe` | as `prefabs`, `prefab check`, `prefab describe` | no |
| `prefab_new`, `showroom` | as `prefab new` and `showroom` | yes |

How it is built, and why:

- **One implementation.** Each tool calls a function in `tools/scene/commands.js`, the one `tools/scene.js` calls for the command line, so the two fronts cannot drift. The functions print nothing and never exit: they return lines.
- **Writing answers with the check.** `scene_write` returns every problem the scene has after the write, so the loop is one call per step, and a tool result is never an error merely because the scene has findings: an error result means the request made no sense (an unknown scene, a path outside the folder).
- **Files stay in their folder.** Paths are relative to one scene folder and may not leave it; only `.json`, `.md`, `.js`, `.svg`, `.txt` and `.csv` can be written, half a megabyte at most. Pictures, video and models are put into the folder by other means.
- **It runs code.** A scene's own object types are JavaScript modules, and checking them runs them in the server's process, as `check` does on the command line. Run the server only over scenes you would run yourself.
- **A sandbox.** `ROOMKIT_SCENES=/some/folder node tools/mcp.js` works on that folder of scenes instead of `public/scenes/` (it needs its own `index.json`: `{ "default": "x", "scenes": [] }`). The tests use this.

The server is `@modelcontextprotocol/server`, a dev dependency; `test/mcp.test.js` drives it with the SDK's client over an in-memory transport.

## Trying it on an agent

The tools were shaped by handing a fresh agent a brief and nothing else, and reading where it stumbled. To repeat that after a change: give an agent that has not seen the repository one paragraph ("an L-shaped gallery, three pictures on the north wall, a desk in the south-east corner facing them, a door that leads back to the whole room"), and judge the result by its own `brief.json` under `check --strict` and by the picture from `shots`. What it gets wrong twice is a fault in the tools or in the instructions, not in the agent. `docs/research/agent-friendly.md` keeps the findings so far.
