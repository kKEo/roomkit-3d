# Long wall

Three frames on the long north wall. This scene exists to show a room that is not a box: its `scene.json` gives a `footprint` of six corners instead of a width and a depth.

**The frames are clickable.** Each one has an `action` bound to its `frame` hotspot: the left one flies to the south wing, the middle one hides and shows this panel, the right one flies to the studio. The door in the inner wall leads back to the whole-loft view.

```list
[
  { "icon": "L", "title": "Footprint", "text": "A polygon of [x, z] corners, any winding. Width and depth are derived from it." },
  { "icon": "#", "title": "Grids and walls", "text": "Floor and ceiling grids are clipped to the outline; every edge gets panels and skirting." },
  { "icon": "◎", "title": "Camera", "text": "The overview and the flight arcs use the footprint's bounds and centroid." },
  { "icon": ">", "title": "Actions", "text": "\"actions\": { \"frame\": { \"type\": \"goTo\", \"poi\": \"studio\" } } on an object makes that part clickable." }
]
```
