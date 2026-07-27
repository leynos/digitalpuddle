.PHONY: all fmt check-fmt typecheck lint test build clean generate markdownlint \
	nixie spelling spelling-helper-test

MDLINT ?= markdownlint-cli2
UV ?= uv
UV_ENV = UV_CACHE_DIR=.uv-cache UV_TOOL_DIR=.uv-tools
TYPOS_VERSION ?= 1.48.0
TYPOS = $(UV) tool run typos@$(TYPOS_VERSION)
XARGS_R := $(shell if xargs --help 2>&1 | grep -q '\\-r'; then printf -- '-r'; fi)

all: check-fmt typecheck lint test spelling

fmt:
	bun run fmt
	mdformat-all

check-fmt:
	bun node_modules/@biomejs/biome/bin/biome check --linter-enabled=false --assist-enabled=false .

typecheck:
	bun run check:types

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

spelling: spelling-helper-test # Enforce en-GB-oxendict spelling in Markdown prose
	@$(UV_ENV) $(UV) run scripts/generate_typos_config.py
	@git ls-files -z '*.md' | \
		xargs -0 $(XARGS_R) env $(UV_ENV) $(TYPOS) --config typos.toml --force-exclude

spelling-helper-test: # Validate the shared spelling-policy integration
	@PYTHONPATH=scripts $(UV_ENV) $(UV) run --python 3.13 \
		--with pytest==9.0.2 --with pytest-cov==7.0.0 \
		python -m pytest scripts/tests/test_typos_rollout.py \
		--cov=generate_typos_config --cov=typos_rollout \
		--cov=typos_rollout_cache --cov-fail-under=90

nixie:
	nixie --no-sandbox
