# Scene Rooms — build and serve the app and its documentation.
# Run `make` (or `make help`) for the list of targets.

BOOKS     := user operator tester
GUIDE     := docs/guide
SITE      := site
BOOK      ?= user
PORT      ?=
SITE_PORT ?= 8000

# Optional `PORT=…` passed through to Vite / mdBook.
VITE_PORT   = $(if $(PORT),-- --port $(PORT))
MDBOOK_PORT = $(if $(PORT),--port $(PORT))

.DEFAULT_GOAL := help
.PHONY: help install dev build serve test lint check docs docs-check docs-serve docs-site-serve all clean

help: ## List the targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-16s %s\n", $$1, $$2}'
	@echo
	@echo "  Variables: PORT=<n> (dev, serve, docs-serve), BOOK=user|operator|tester (docs-serve), SITE_PORT=<n> (docs-site-serve, default $(SITE_PORT))"

node_modules: package.json package-lock.json
	npm install
	@touch node_modules

install: node_modules ## Install the pinned npm dependencies (only when package files changed)

dev: node_modules ## Run the app with hot reload (http://localhost:5173)
	npm run dev $(VITE_PORT)

build: node_modules ## Build the app into dist/
	npm run build

serve: build ## Build the app and serve the production build (http://localhost:4173)
	npm run preview $(VITE_PORT)

test: node_modules ## Run the unit tests (vitest)
	npm test

lint: node_modules ## Lint the source (eslint)
	npm run lint

check: lint test build ## Lint, test and build — what CI runs

docs: docs-check ## Build all three books and the landing page into site/ (ready for GitHub Pages)
	rm -rf $(SITE)
	@for b in $(BOOKS); do mdbook build $(GUIDE)/$$b || exit 1; done
	rm -f $(SITE)/*/book.toml $(SITE)/*/.gitbook.yaml
	cp $(GUIDE)/index.html $(SITE)/index.html
	touch $(SITE)/.nojekyll
	@echo "Docs written to $(SITE)/ (open with: make docs-site-serve)"

docs-check: ## Check every book builds (a file missing from SUMMARY.md fails); writes nothing to site/
	@tmp=$$(mktemp -d) && trap 'rm -rf "$$tmp"' EXIT && \
		for b in $(BOOKS); do mdbook build $(GUIDE)/$$b -d "$$tmp/$$b" || exit 1; done && \
		test -f $(GUIDE)/index.html && echo "docs-check: all books build"

docs-serve: ## Live-preview one book with reload (BOOK=user|operator|tester, http://localhost:3000)
	mdbook serve $(GUIDE)/$(BOOK) --open $(MDBOOK_PORT)

docs-site-serve: docs ## Build the docs and serve the whole site, landing page included (http://localhost:8000)
	python3 -m http.server $(SITE_PORT) -d $(SITE)

all: build docs ## Build the app and the docs

clean: ## Remove build output (dist/, site/)
	rm -rf dist $(SITE)
