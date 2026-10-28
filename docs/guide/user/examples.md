# Examples and ideas

This page describes the two example scenes that ship with Scene Rooms and some ideas for your own, so you can decide quickly whether a room fits what you want to show. Open each example and look at its files side by side.

## The examples

**Neo Room** (`public/scenes/neo-room/`, the default). A green "Matrix" studio website with six stops: a floating shape at the entrance, project frames on a wall, a wardrobe archive, an "about us" cinema screen, a server room for services, and a desk with a contact form. Look here to see:

- one stop with several objects and a hand-placed camera (`poi/02-projects.json`);
- a stop with no camera at all, placed automatically (`poi/03-archive.json`);
- a panel written inside the point-of-interest file instead of Markdown (`poi/05-services.json`).

**Amber Gallery** (`public/scenes/gallery/`). A smaller amber room with two framed pictures and a cinema screen showing a poster. Open it with `?scene=gallery`. Look here to see:

- your own pictures in frames and on a screen (`media/`);
- a different theme, fog, easing curve and interface words, all in `scene.json`.

## Ideas

| Idea | Objects to use |
| --- | --- |
| Portfolio: one frame per project, an "about" screen, a contact desk | `pictureFrame` with `image`, `cinemaScreen`, `desk` |
| Virtual exhibition: artworks with captions and a floating sculpture | `pictureFrame` with `exhibit`, `pedestal` |
| Product tour: one stop per feature, a video on the big screen | `cinemaScreen` with `source: "video"`, `primitive` |
| Team page: a wardrobe "archive" of past projects, a timeline of the company | `wardrobe`, `timeline` blocks |
| Event page: programme on the screen, sign-up form at the desk | `list` and `form` blocks |

> **Note.** A room is meant for a handful of stops (up to nine). For long text, such as documentation, link out to a normal web page from a panel.
