# Quick start: your first point of interest

This walk-through adds a picture frame with your own text to the example room. It takes about ten minutes. You will create two small files, add one line to a third, and reload the page.

## Before you start

You need a running copy of the site that shows your changes. If someone else runs it for you, ask them for the preview address and where the `public/scenes/` folder is. If the project is on your computer, open a terminal in the project folder and run:

```bash
make dev      # then open the address it prints, usually http://localhost:5173
```

If `make` is not available, run `npm install` once and then `npm run dev`.

You should see the green room fly in and stop at **01 Start**.

## 1. Describe the point of interest

Create the file `public/scenes/neo-room/poi/07-hello.json` with this content:

```json
{
  "id": "hello",
  "label": "Hello",
  "kicker": "east wall",
  "objects": [
    { "type": "pictureFrame", "position": [15, 3.2, 8], "rotation": [0, -90, 0] }
  ],
  "content": { "markdown": "content/hello.md" }
}
```

This says: put a picture frame on the east wall (`15` is the wall's position, `3.2` the height of the frame's centre), turn it to face into the room, and show the text from `content/hello.md` when a visitor arrives. The camera position is worked out for you.

## 2. Write the text

Create `public/scenes/neo-room/content/hello.md`:

```markdown
# Hello

This is my first point of interest. The paragraph straight after the title is shown a little larger.

Everything else is ordinary text. **Bold** and [links](https://example.com) work too.
```

## 3. Add it to the room

Open `public/scenes/neo-room/scene.json`, find the `"poi"` list at the bottom, and add your file at the end. Mind the comma after the previous line:

```json
  "poi": [
    "poi/01-start.json",
    "poi/02-projects.json",
    "poi/03-archive.json",
    "poi/04-about.json",
    "poi/05-services.json",
    "poi/06-contact.json",
    "poi/07-hello.json"
  ]
```

## 4. See it

Reload the page and press `7`, or click **07 Hello** in the top bar. The camera flies to the east wall and your panel slides in.

> **Tip.** If the page shows a red **Could not load the scene** message instead, it names the file and the line that is wrong. See [FAQ and troubleshooting](faq.md).

## Next steps

- Show a picture inside the frame: [Choosing objects](objects.md).
- Add numbers, cards or a contact form to the panel: [Writing panel content](content.md).
- Move the camera yourself: [Placing a point of interest](points-of-interest.md).
