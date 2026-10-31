# RoomKit 3D

A walkable 3D room built from **configuration files**. The camera flies between stops, each one places objects in the room and opens a panel like this one. Scenes, objects and text live in JSON and Markdown, so a whole site like this ships without touching code.

```stats
[
  { "value": "6", "label": "stops in this hall" },
  { "value": "10", "unit": "+", "label": "object types" },
  { "value": "9", "label": "kinds of screen" }
]
```

The big screen is playing the intro. **Click it** to watch up close, press `Esc` to step back.

```list
[
  { "icon": "→", "title": "Next stop", "text": "Arrow keys, the mouse wheel, or a swipe." },
  { "icon": "◆", "title": "Markers", "text": "Click a floating marker anywhere in the hall." },
  { "icon": "0", "title": "The whole hall", "text": "Press 0 or the logo for the roof-off view." },
  { "icon": "W", "title": "Free fly", "text": "W A S D to walk, Q E for height, middle-drag to look." }
]
```
