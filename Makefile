.PHONY: build typecheck clean publish release-patch release-minor release-major

# ── Development ───────────────────────────────────────────────────────
typecheck:
	bun run typecheck

build: clean
	bun run build

clean:
	rm -rf dist

# ── Release ───────────────────────────────────────────────────────────
# make release-patch    → 0.1.0 → 0.1.1
# make release-minor    → 0.1.0 → 0.2.0
# make release-major    → 0.1.0 → 1.0.0

release-patch: build
	npm version patch -m "Release %s"
	git push origin main --follow-tags

release-minor: build
	npm version minor -m "Release %s"
	git push origin main --follow-tags

release-major: build
	npm version major -m "Release %s"
	git push origin main --follow-tags

# ── Publish to npm ────────────────────────────────────────────────────
publish: build
	npm publish --access public
