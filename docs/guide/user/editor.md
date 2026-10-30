# Editing in the browser

This page shows how to build a scene without touching the repository: edit its files in the browser with the room updating live, then download the folder.

## Open the editor

Open `edit.html` next to the app, for example `http://localhost:5173/edit.html`. Add `?scene=gallery` to start from an existing scene instead of the one-stop template.

The left pane lists the scene's files. Click one to edit it; the room on the right follows a moment after you stop typing. The usual keys work in the room (`1`–`9`, `0`, `H`, `M`, `Esc`); the scroll wheel scrolls the editor when the mouse is over it.

## Make changes

- **Edit a file.** Everything on the [scene.json](../operator/reference/scene-json.md) and [point of interest](../operator/reference/poi-json.md) pages applies. A mistake shows up under the text in red, as `file › field: problem`, and the file turns red in the list. The room keeps showing the last version that worked.
- **New point of interest.** Choose an object type in the dropdown, click **New point of interest**, give it a name. A file `poi/<name>.json`, a page `content/<name>.md` and the entry in `scene.json` are created, with the camera and marker placed automatically.
- **Add to …** appends an object of the chosen type to the file you are editing (to `decor` when that is `scene.json`), with every setting written out at its default, so you can see what there is to change.
- Pictures and videos: write their paths as usual (`"media/photo.jpg"`); they show once the files are in the folder's `media/` directory on the server.

## Publish

1. Type a **folder** name at the top (letters, digits, `-` and `_`) and click **Download .zip**.
2. Send the zip to whoever runs the site, or unzip it yourself into the site's `scenes/` folder, add your media files to its `media/` directory, and add the folder name to `scenes/index.json`.
3. Visitors open `…/?scene=<folder>`. They see the room only; the editor is not part of what they get.

> **Tip.** The downloaded folder is also what goes into `public/scenes/` in the repository when a scene should ship with the app.
