.PHONY: all fmt check-fmt typecheck docs-check lint test build clean generate markdownlint \
	nixie spelling

MDLINT ?= markdownlint-cli2
# `make fmt` and `make check-fmt` call mdtablefix directly. `--git` selects the
# Markdown files Git tracks and `--include-untracked` adds the untracked files
# Git does not ignore, so a new document is formatted before it is staged.
# Both modes need mdtablefix 0.6.0 or later; CI pins the version at the
# install-mdtablefix step.
MDTABLEFIX ?= mdtablefix
MDTABLEFIX_SELECT = --git --include-untracked
MDTABLEFIX_RULES = --wrap --renumber --breaks --ellipsis --fences
UV ?= uv
TYPOS_CONFIG_BUILDER_VERSION ?= v0.1.4
TYPOS_CONFIG_BUILDER = $(UV) tool run --python 3.14 --from \
	"git+https://github.com/leynos/typos-config-builder.git@$(TYPOS_CONFIG_BUILDER_VERSION)" \
	typos-config-builder
XARGS_R := $(shell if xargs --help 2>&1 | grep -q '\\-r'; then printf -- '-r'; fi)

all: check-fmt typecheck docs-check lint test spelling

fmt:
	bun run fmt
	$(MDTABLEFIX) --in-place $(MDTABLEFIX_SELECT) $(MDTABLEFIX_RULES)
	@unset FORCE_COLOR; $(MDLINT) --fix "**/*.md"

check-fmt:
	bun node_modules/@biomejs/biome/bin/biome check --linter-enabled=false --assist-enabled=false .
	$(MDTABLEFIX) --check $(MDTABLEFIX_SELECT) $(MDTABLEFIX_RULES)

typecheck:
	bun run check:types

# Zero-tolerance documentation gate: TypeDoc's notDocumented validation over
# the package entry point (typedoc.json). Runs after typecheck so the
# generated GraphQL types already exist. Emits no documentation artefacts.
docs-check: typecheck
	bun run docs:check

lint:
	bun run lint

test:
	bun run test

build:
	bun run build

clean:
	rm -rf dist src/__generated__/resolvers-types.ts

generate:
	bun run generate

markdownlint: spelling # Lint Markdown files and enforce repository spelling
	find . -type f -name '*.md' -not -path '*/target/*' -not -path '*/node_modules/*' -print0 | xargs -0 $(XARGS_R) $(MDLINT)

spelling: ## Enforce en-GB-oxendict spelling in prose
	$(TYPOS_CONFIG_BUILDER) gate --repository .

nixie:
	nixie --no-sandbox
