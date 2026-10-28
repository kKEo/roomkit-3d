# Documentation index

All user-facing documentation lives in `docs/guide/`: one static landing page and three books, each a self-contained GitBook space that mdBook can also build.

| Path | What |
| --- | --- |
| [`guide/index.html`](guide/index.html) | landing page with one card per book; copy it to the site root |
| [`guide/user/`](guide/user/README.md) | **Content guide**: plain-language, for scene and content authors |
| [`guide/operator/`](guide/operator/README.md) | **Operator guide**: architecture, build and deploy, the configuration reference, extending, operations |
| [`guide/tester/`](guide/tester/README.md) | **Tester guide**: checks, merge gates, adding tests, the exploratory checklist |

Each book has `README.md`, `SUMMARY.md` (only listed pages are published), `.gitbook.yaml` and `book.toml`.

## Build locally

```bash
make docs                       # build all books into site/<book>/ and copy the landing page to site/
make docs-check                 # check every book builds; writes nothing
make docs-serve BOOK=operator   # live preview of one book, http://localhost:3000
make docs-site-serve            # build and serve the whole site with the landing page, http://localhost:8000
```

`site/` is git-ignored. mdBook must be installed (`brew install mdbook` or `cargo install mdbook`).

## Design documents

None are checked in yet. Link future design documents here, and from the books use absolute URLs to them, because only the books are published.
