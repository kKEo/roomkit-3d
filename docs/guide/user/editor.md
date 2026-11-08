# Editing in the browser

This page shows how to build a scene without touching the repository: arrange its objects in a tree, or edit its files as text, with the room updating live, then export the folder.

## Open the editor

Open `edit.html` next to the app, for example `http://localhost:5173/edit.html`. Add `?scene=gallery` to start from an existing scene instead of the one-stop template.

![The editor: a left pane with the folder name, Import… and Export… at the top, then + Add, undo and redo, Preview and Select, Move and Rotate; below them Objects and Files tabs and a filter box; the scene tree with the room, the scenery (bench, door) and three stops, the bench selected and the Landscape stop opened to show its pictureFrame; under the tree the inspector with Belongs to, position, rotation, scale, width and height; the Amber Gallery room on the right, the bench in a box with red, green and blue move arrows on it](images/editor.png)

*The editor opened with `?scene=gallery`. Left: the scene tree with the selected object's settings under it; right: the live room, with a box and move handles on what is selected.*

The pane has two views of the same scene: **Objects**, a tree of what is in the room, and **Files**, the scene's files as text. Whatever you change in one shows in the other, and the room on the right follows a moment later. The usual keys work in the room (`1`–`9`, `0`, `H`, `M`, `Esc`); the scroll wheel scrolls the editor when the mouse is over it. `⌘Z` / `Ctrl+Z` undoes the last change and `⇧⌘Z` / `Ctrl+Y` redoes it (also with the ↶ ↷ buttons).

## The scene tree

The tree has three parts:

| Part | What it is |
| --- | --- |
| **Room** (the scene's title) | the room itself: its title, size, walls and lights |
| **Scenery** | objects that are only there to be seen, such as seats, benches and lamps. Visitors do not stop at them |
| **Stops** | the points visitors are taken to, in the order of the tour (the number keys and `←` `→` follow it). Each stop holds one or more objects, has its own camera position, a floating diamond and a text page |

Click a row to select it: a box shows it in the room, and its settings appear under the tree. Clicking a stop also flies the camera there. To see an object up close, double-click it, or press `F` or `Enter`.

**Preview** and **Select** at the top decide what a click in the room does. In **Preview** it does what it does for visitors (a screen zooms in, a door opens a link). In **Select** it selects the object under the pointer, opens its branch in the tree, and a double-click flies to it.

On the right of a row, ● hides the object in the preview and ⊘ locks it, so that clicks in the room go through it to what is behind (useful for big things such as a projector's beam or the seats). Neither is saved: they only help while you work. A red ⚠ with a number counts the problems in that row, as described in [Edit the files](#edit-the-files).

The filter box above the tree narrows it to matching names; `t:desk` shows only objects of that type. The stops of what matches stay visible, so you can see where each match belongs.

| Key (with the tree focused) | Does |
| --- | --- |
| `↑` `↓`, `Home` `End` | move through the rows |
| `→` `←` | open or close a branch; go to its first row or back to its parent |
| a letter | jump to the next row starting with it |
| `Enter`, `F` | fly to the row |
| `F2` | rename (an empty name brings back the automatic one) |
| `Delete` | delete (a stop asks first) |
| `⌘D` / `Ctrl+D` | duplicate an object, a metre to the side |
| `Alt+↑` `Alt+↓` | move a stop earlier or later in the tour, or an object within its list |
| `H` | hide or show in the preview |

With the room (or nothing) focused, `G` and `R` switch the handles between Move and Rotate.

Right-click a row for the same commands and a few more: **Show only this stop**, **Lock all scenery**, **Edit page**.

## Move and turn objects in the room

The selected object carries handles in the room, in the colours of the room's directions: red left and right (x), green up and down (y), blue towards and away from the front (z).

| Handle | Does |
| --- | --- |
| **Move** (or press `G`): an arrow | drag it to slide the object along that direction |
| **Move**: a small square between two arrows | drag it to slide the object across that plane, for example over the floor |
| **Rotate** (or press `R`): a ring | drag it to turn the object around that direction; the green ring turns it to face another way |

Moves go in steps of 10 cm and turns in steps of 15°; hold `Shift` while dragging to go freely. `Esc` during a drag puts the object back. When you let go, the new position or rotation is written into the object's file (the numbers in its settings follow), and `⌘Z` / `Ctrl+Z` takes it back. Dragging a handle never selects anything else or moves the camera to another stop. The handles work in Preview and in Select; they are not shown for a whole stop, or while you are up close to a screen.

## Add an object, then decide what it is

1. Click **+ Add**, type part of a name (`desk`, `frame`, `screen`) and press `Enter`, or click a type. The object lands in the **Scenery**, on the floor where the camera is looking, turned towards you and a little aside from anything already standing there.
2. If visitors should stop at it, make it a stop: click **Make it a stop** in the message that appears, choose **New stop with this object…** in its **Belongs to** list, or right-click it and pick **Make it a stop**. Type the stop's name and press `Enter`. The name also gives the stop its id (the `#name` in links) and its page `content/<name>.md`. The camera and the diamond are placed from the object; to show it from somewhere else, fly there and click **Use current view** in the stop's settings.

You can change your mind at any time:

- **Move an object** between the scenery and a stop, or from one stop to another: change its **Belongs to**, drag it onto **Scenery** or onto a stop, or right-click it and use **Move to**. It stays exactly where it is in the room; only its role changes.
- **Turn a stop into scenery**: drag it onto **Scenery**, or click **Turn into scenery** in its settings. Its objects stay where they are; its name, camera, diamond and page go. The editor first lists what will go, including links and buttons elsewhere that lead to that stop.
- **Reorder the tour**: drag a stop above or below another one.

A drag that cannot be done says why (a stop cannot go inside another stop, for example). Everything here can be undone.

## Change an object, a stop or the room

The settings under the tree belong to the selected row:

- **An object**: its name, **Belongs to**, position, rotation and scale, then every setting its type has, with the right kind of field for each (a number, a tick box, a list of choices). A setting changed from its default is marked with a bar on the left; ↺ puts it back. Numbers are applied when you press `Enter` or leave the field. Below them, **On click** sets what a click on each clickable part does (a desk's chair, a door, a picture frame): nothing, go to a stop, zoom into a screen, open a link (with an optional question first), show or hide the panel, or send an event to the page. **JSON** shows the object as text, for anything else.
- **A stop**: its name and the small line above it (kicker), where the camera looks from (**Use current view**, or **Place from object** to go back to automatic), its diamond, and **Edit page** for its text. **Turn into scenery** and **Delete stop** are here too.
- **The room**: its title, the logo text and its size. Everything else (lights, walls, theme) is in `scene.json` (**Open scene.json**); where the room opens and free flight are in [Export…](#export-a-scene-or-a-site).

## Set up screens

A control desk, a desk, a cinema screen, and a scene's own objects built on screens get a screen editor in their settings:

![The editor with neo-room's control desk selected: under its settings a sketch of the wall of twelve screens in four columns (NETWORK, STATUS, PERIMETER, uplink, floorplan, FLEET, …), FLEET highlighted; below it + Screen, Duplicate, ◀ ▶ and Remove, then the FLEET screen's settings: what it shows (Stats chosen among Rain, Image, Video, Text, Graph, Stats, Terminal, Dashboard and Form), its title, numbers and colour, with Live data starting below. On the right the same wall of screens in the room](images/editor-screens.png)

- **The wall**: a control desk's screens are drawn as they hang, left to right and top row first, each with its symbol and title. ⟳ marks live data, ↗ a click that does something else than zoom, ⊘ a screen that cannot be clicked, a red border a mistake. Click a tile, or in **Select** mode click the screen in the room: its settings open below and a pale box marks it in the room. **+ Screen**, **Duplicate**, ◀ ▶ (earlier or later on the wall) and **Remove** change the wall; a click set up for a screen moves with it.
- **Shows**: pick what the screen shows. Only the settings that kind of screen uses are listed: a caption and colour for rain; a file for an image or video; lines for text; the kind, numbers, range and blips for a graph; up to eight numbers for stats; a prompt, a banner and commands with their answers for a terminal; rows, columns, filter chips and a bar for a dashboard; fields, a button and an address for a form. Switching to another kind removes the settings it does not use, and says so (`⌘Z` brings them back).
- **Live data**: *fetch* reads an address (again every so many seconds, if you set it), *stream* listens to one, *both* does both; **transform** picks one of the functions `scene.json` declares. What you set under **Shows** is on screen until the first answer arrives.
- **On click**: *Zoom in* (the default), *Nothing*, or any of the actions above, for example *Zoom into another screen*. In the scenery a screen zooms only when you choose *Zoom in* there yourself. The editor warns when a terminal, a dashboard or a form gets another click, because visitors could no longer reach it.
- **Name**: the screen's id, which actions and zoom links use and which keeps what visitors typed into it. Renaming it moves its click setting along.

## Edit the files

**Files** lists the scene's files. Click one to edit it as text; everything on the [scene.json](../operator/reference/scene-json.md) and [point of interest](../operator/reference/poi-json.md) pages applies. Changes made in the tree are written into these files without disturbing how the rest of each file is laid out.

A mistake, in either view, shows at the bottom in red as `file › field: problem`. The file turns red in the list, and in the tree the object, its stop and the group get a ⚠ with the number of problems. Selected, the object shows the problem above its settings. The room keeps showing the last version that worked.

![The editor with the Landscape stop's picture frame selected: the frame, its stop and the Stops group carry a red ⚠ 1 in the tree, the inspector shows objects.0: Unrecognized key "positon" above the frame's settings, and the same line is at the bottom of the pane](images/editor-error.png)

*A misspelt `position` in a stop's file. The tree marks the object and its stop; the room on the right is unchanged.*

Pictures and videos: write their paths as usual (`"media/photo.jpg"`); they show once the files are imported (see below) or are in the folder's `media/` directory on the server.

## Import

**Import…** at the top takes files from your computer:

- **A scene zip**: one you exported earlier (a scene folder or a whole site), or any zip with a `scene.json` in it. The editor opens that scene, with its pictures, videos, data files and modules kept in memory, so the preview shows them and the next export includes them. The folder name is taken from the zip.
- **Media files** (pictures, videos, audio, `.js` modules, `.json` data): they are added under `media/` in memory. Write `"media/<file name>"` in a file and the preview shows them at once; they go into the next export too.

An imported zip replaces what the editor currently shows, so export first if you want to keep your changes.

## Export a scene or a site

**Export…** unfolds a section with two settings and two kinds of zip. The settings are saved in the room's `scene.json`, so the preview on the right follows them at once and both zips carry them:

| Setting | What it does |
| --- | --- |
| **Allow free flight** | Untick it and visitors cannot take the camera by hand: the fly keys and the middle mouse button do nothing, and the hint at the bottom no longer mentions them. Visitors still move between stops |
| **opens at** | Where the room opens for someone who arrives without a `#stop` in the address: the whole room from above, one of the stops, or a **fixed view**. For a fixed view, move the camera where you want it (fly there, or go to a stop and step up to a screen) and click **Use current view**; the numbers under the dropdown are that position. A link with `#stop` still opens at that stop |

Below the settings the editor lists the files the zip gets besides the text files: those the room refers to (pictures, videos, data files, modules) and those you imported. A file is taken from memory if it was imported, otherwise fetched from the room's published folder. Two kinds of file cannot be found by reading the room: files an object type's own module loads (models, textures) and media that live data answers with. Import them, or copy them into the unzipped folder by hand. A room that was never published and has nothing imported shows its files in red after an export; add them the same way.

Then pick the zip:

| Button | Gives | Use it when |
| --- | --- | --- |
| **Scene folder .zip** | `<folder>.zip`, holding `<folder>/` with the text files and the files above | the room joins a site that hosts several rooms. Send the zip to whoever runs the site, or unzip it into the site's `scenes/` folder yourself and add the folder name to `scenes/index.json`. Visitors open `…/?scene=<folder>`. This folder is also what goes into `public/scenes/` in the repository when a room should ship with the app |
| **Whole site .zip** | `<folder>-site.zip`: the viewer, this room and its files, ready to unzip onto any web host that serves plain files | the room gets an address of its own. Its `index.html` opens the room; the editor is not part of it. From the development server the first export takes a few seconds longer, while the viewer is built |

> **Note.** Doors or frames that link to another room (`?scene=…`) lead nowhere in a one-room site.
