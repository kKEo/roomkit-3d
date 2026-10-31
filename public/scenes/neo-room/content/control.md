# Control center

Vivamus sagittis lacus vel augue laoreet rutrum. Every screen on this wall is configured on its own, in one list inside this point's file.

**Click a screen to step up to it** — the console takes commands, the node table filters, the report form fills in. Press **Esc** to step back.

```stats
[
  { "value": "09", "label": "screens" },
  { "value": "24/7", "label": "lorem uptime" },
  { "value": "0", "label": "ipsum incidents" }
]
```

```list
[
  { "icon": "~", "title": "Network", "text": "A live signal graph — source \"graph\", style \"wave\"." },
  { "icon": ">", "title": "Status", "text": "Terminal lines typed out — source \"text\"." },
  { "icon": "◎", "title": "Perimeter", "text": "A radar sweep — style \"radar\"." },
  { "icon": "▦", "title": "Floor plan", "text": "A picture from the scene's media folder — source \"image\"." },
  { "icon": "ｱ", "title": "Uplink", "text": "Its own Matrix rain, caption and colour — source \"rain\"." },
  { "icon": "$", "title": "Console", "text": "Type help, status, goto 1 — source \"terminal\"." },
  { "icon": "≡", "title": "Nodes", "text": "Filter by region, status or text — source \"dashboard\"." },
  { "icon": "✎", "title": "Report", "text": "A form you fill in up close — source \"form\"." },
  { "icon": "▮", "title": "Load", "text": "Live levels in amber — style \"bars\" with a colour." },
  { "icon": "#", "title": "Fleet", "text": "Big live numbers from a feed — source \"stats\"." }
]
```

The fleet numbers below, the node table, the fleet screen and the node load bars all read one live feed, `data/nodes.json`, every 15 seconds. Edit that file and watch them change.

```stats
{ "feed": { "url": "data/nodes.json", "refresh": 15, "transform": "fleetSummary" } }
```

Donec ullamcorper nulla non metus auctor fringilla. Sed posuere consectetur est at lobortis.
