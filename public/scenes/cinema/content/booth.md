# The projection booth

Every screen on this desk reads `data/showtimes.json` every 20 seconds and shows a different cut of it: house numbers, the board, occupancy bars and the full programme. Edit the file, or point the feed at your own API, and they all follow.

```stats
{ "feed": { "url": "data/showtimes.json", "refresh": 20, "transform": "houseSummary" } }
```

Click a screen to zoom in. The **PROGRAMME** table filters, and the **PROJECTIONIST** console answers `help`, `status`, `reel` and `scenes`.
