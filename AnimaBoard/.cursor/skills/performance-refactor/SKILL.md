---
name: performance-refactor
description: >-
  Refactors the codebase for runtime and bundle performance, removes dead code
  and unused exports, and improves clarity with purposeful comments. Use when
  the user asks for performance optimization, cleanup, removing unused code,
  dead code elimination, refactoring for maintainability, or making code more
  readable. Applies to React/TypeScript client and Node.js server in this repo.
---

# Performance & cleanup refactor

## Goals (in order)

1. **Performance**: Faster loads, fewer wasted renders, leaner API and data paths—without premature micro-optimization.
2. **Dead code**: Remove unused files, exports, functions, imports, and unreachable branches once verified.
3. **Readability**: Clear structure and naming; comments only where they add real value (intent, invariants, non-obvious tradeoffs).

## Constraints

- Change only what serves this pass; avoid unrelated refactors or style sweeps across untouched files.
- Prefer one coherent PR-sized slice per session unless the user asks for a full-repo pass.
- After removals, run the build/tests the project already uses; fix any breakage you introduce.

## Workflow

Copy and track progress:

```
- [ ] Baseline: note entry points (client `client/src`, server `server`, shared `lib`, `api`)
- [ ] Inventory: list candidates (large components, hot paths, duplicate logic)
- [ ] Dead code: confirm no references (see below) before deleting
- [ ] Performance: apply targeted fixes; avoid blanket memoization
- [ ] Readability: rename/split only when it reduces confusion or duplication
- [ ] Verify: lint, build, smoke critical flows
```

### Dead code and unused symbols

1. Search for references to the symbol, file, or route before removing (imports, dynamic `import()`, strings in configs, server routes).
2. Distinguish **unused in app** from **used by scripts, cron, or deployment** (e.g. `scripts/`, root `*.js` tools).
3. Remove unused exports from barrels (`index.ts`) when safe; prefer deleting unused files over leaving empty stubs.
4. Drop commented-out blocks that are obsolete; if history matters, it lives in git—not long commented sections.

### Performance (React / TypeScript client)

- Measure or reason from structure: unnecessary parent re-renders, huge lists without virtualization, expensive work in render.
- `useMemo` / `useCallback` / `React.memo` only when a child is costly or referential identity matters; do not wrap everything by default.
- Lazy-load heavy routes or charts when it clearly reduces initial bundle size.
- Stable keys for lists; avoid inline object/array literals passed to memoized children when it defeats memoization.
- Debounce or throttle user-driven high-frequency updates (search, resize) where appropriate.

### Performance (Node server and API)

- Avoid redundant DB or external calls; batch or cache where the codebase already has patterns for it.
- Do not add new dependencies unless the user agrees or the gain is large and obvious.

### Comments and readability

- Prefer **clear names and small functions** over comments that repeat the code.
- Add short comments for: non-obvious **why**, edge cases, security or data assumptions, and public contract of non-trivial modules.
- Align with existing project style (imports, formatting, file layout).

## Verification

Run from repo root what exists: e.g. client `npm test` / `npm run build`, server start script, or `eslint` if configured. Report what was run and any remaining risks (e.g. dynamic imports not found by static search).

## Output to the user

Summarize:

- What was removed or optimized and **why it is safe**
- Performance impact (expected: bundle, TTI, or hot path)—honest if uncertain
- Follow-ups that need measurement or product decision
