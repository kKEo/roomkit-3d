# Pull-request checklist

This page is the list to tick before asking for review. Copy it into the pull-request description.

```markdown
- [ ] `make build` passes
- [ ] every scene in public/scenes/index.json loads (no "Could not load the scene")
- [ ] every point of interest in every scene opens; no red blocks, no console errors
- [ ] `make serve` deep link works for at least one scene
- [ ] exploratory checks relevant to this change done (list them)
- [ ] new config keys, props or blocks: defaults in code, operator reference page, content guide page
- [ ] new error messages: content guide FAQ updated
- [ ] docs changed: `make docs-check` passes
```

## Why each line

- **Config, props and blocks need three updates** (code default, operator reference, content guide) because content authors only read the content guide, and the reference is the only complete list.
- **Error messages are user interface.** The FAQ quotes them so authors can search for them.
- **List the exploratory checks you did**, so the reviewer knows what was *not* looked at.
