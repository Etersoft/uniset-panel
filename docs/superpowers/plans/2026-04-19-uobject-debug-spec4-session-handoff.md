# Spec 4 Session Handoff — 2026-04-19 23:40 MSK

**To resume:** launch Claude Code from `/home/pv/Projects/uniset-panel` (so primary cwd = panel repo, gopls workspace clean). Read this file first, then continue.

---

## What we're building

**UObject debug visualizer Spec 4** — detail panel (Variables / Trends / Message Log) for uniset-panel. Part of a 4-spec decomposition:
- Spec 1 (uniset-2.x commit `fc6a0718`): dispatch-trace API + `/<Object>/dump` — DONE, merged upstream.
- Spec 2 backend + Spec 4 frontend: **combined in this branch**.
- Spec 3: System Overview + CustomEvent hooks + trace frontend API — DONE, squashed as first commit on this branch.

## Branch state

```
branch: story/uobject-debug-spec4
parent: master @ a3d909c
HEAD:   cbffe37
```

Latest commits (most recent first):
```
cbffe37 fix(detail): add min-height to .detail-panel for standalone rendering
cfc7c5e fix(detail): rename renderVariables → renderDetailVariables (name clash with 51-ui-render.js)
7139bdf fix(spec4): SSE envelope unwrap, poll halt, force errors, var, split
709199e fix(spec4): Stop race, body size cap, 502 for network errors
a056d7e docs(detail): user-facing documentation for UObject detail panel
609019a style(detail): detail panel CSS (header, tabs, variables, trends, log)
7f92913 test(detail): Playwright E2E for UObject detail panel flow
6e88ecd test(mock): stub /snapshot /api/trace/* for Spec 4
d3b1e61 feat(detail): Message Log tab — trace subscribe + render + controls + filter + CSV
800e359 feat(detail): Trends tab — client-side live buffer + window/clear/CSV
820d123 feat(detail): Variables context menu — force/unforce via SM ionc
8d88f74 feat(detail): Variables tab — flat snapshot render + sections + poll
66bc69c feat(detail): 60-detail-panel.js — listener + tab lifecycle + schema-closed cleanup
1fb995e feat(detail): 60-detail-state.js — per-panel localStorage persistence
4e9c02b feat(trace): wire routes + Manager + end-to-end integration test
81bd3b7 feat(api): HandleTraceEnable/Disable proxy + passthrough
11edce7 feat(api): HandleTraceEvents SSE endpoint + TraceManagerInterface
1b3f7f5 feat(api): SSE BroadcastTraceBatch + traceOnly channel isolation
2482f40 feat(trace): Manager registry + reference counting
ab1eb61 test(trace): multi-subscriber adaptive interval + backoff
786de8d feat(trace): TracePoller single-subscriber loop + watermark
30c077e feat(trace): HTTP client for /dump?trace=1 + sentinels
1df9138 feat(trace): envelope + TraceBatch + recordTimeOnly types
3b237b4 feat(api): wire /snapshot route + debug.Client in main
10fe78d feat(api): HandleSnapshot proxy + DebugInterface
2065ffd fix(debug): deterministic sort + non-nil slices in Snapshot adapter
311fe88 feat(debug): Snapshot adapter over uniset /<Object>/dump
fb7ed00 docs(spec4): Phase 0.2 verification — Handlers struct location
8317475 docs(spec4): Phase 0.1 verification — /<Object>/dump envelope (source-based)
f88dbf1 docs(spec4): align plan with /<Object>/dump adapter, drop history tasks
1c7e2a1 docs(spec4): align with actual uniset API — use /<Object>/dump, drop history
a11667f docs(spec4): implementation plan for UObject detail panel + trace backend
ffd1266 docs(spec4): UObject detail panel + Spec 2 trace backend design
752e9fc feat(overview): System Overview with UObject debug support (Specs 1-3)
```

## Test state (last known)

- **Go:** `go build -mod=vendor ./...` clean. `go test ./internal/debug/... ./internal/trace/... ./internal/api/... 2>&1 | tail` — all PASS (debug 7, trace 17 incl. TestTracePoller_StopIdempotent, api 205).
- **Vitest unit:** 69/69 PASS across 10 files (`cd tests && npm run test:unit -- --run`).
- **Playwright `make js-tests` (full Docker E2E, last run):**
  - 411 passed, 4 skipped, **3 failed + 1 pre-existing (recording)**.
  - All 3 remaining failures are in `tests/single/detail-panel.spec.ts`.

## Remaining problem — 3 detail-panel E2E failures

```
✘ detail-panel.spec.ts:39 Variables tab renders 4 sections from mock snapshot
  → locator('.detail-panel').last().locator('[data-section="inputs"]')
    Received: hidden (even though element exists in DOM)

✘ detail-panel.spec.ts:64 Variables row click adds to Trends tab
  → inputRow locator does not resolve (click timeout 30s)

✘ detail-panel.spec.ts:88 Message Log tab shows records after Enable toggle
  → log-enable-toggle button IS visible, but Variables tab button
    "intercepts pointer events" — scroll-into-view followed by
    pointer hit-test lands on Variables button, not Message Log panel
```

**Diagnosis so far:**
- `createDetailTabDOM` (in `60-detail-panel.js`) inserts `<div class="detail-panel">` directly into `document.body` — minimal standalone implementation, not integrated with existing `50-ui-tabs.js` tab container.
- In production, detail-panel is expected to live inside a parent with proper height/layout. In E2E, `document.body` has no guaranteed height, so `.detail-panel { height: 100%; }` collapses.
- Added `min-height: 500px` in commit `cbffe37` — not sufficient. Panel renders but inner sections (`[data-inner-panel]` with `position: absolute; inset: 0`) still have layout issues.

**Two paths forward:**

1. **Proper tab integration** (right fix): modify `createDetailTabDOM` to use existing `openTab()` helper from `50-ui-tabs.js` — wrap detail-panel inside a `.tab-panel` structure that the project already styles correctly. Follow the pattern used by `openSystemOverview`. This also gives the user a real tab entry in the tab bar.

2. **Standalone CSS tuning** (quick fix): replace `position: absolute` with `position: relative` for `.detail-inner-content [data-inner-panel]`, or give explicit inline styles (`inst.root.style.height = '100%'; inst.root.style.width = '100%';`) so standalone rendering works. Risk: may regress production layout when panel is nested in existing tab-container.

**Recommended:** path 1. The unit tests already cover all the logic; E2E just needs the DOM to reflect the production path. Refactoring `createDetailTabDOM` to call `openTab()` or create a sibling tab-panel inside `.tabs-container` would be more honest about how users actually see the panel.

To investigate, dev-viewer is your friend:
```bash
cd /home/pv/Projects/uniset-panel
docker compose up dev-viewer -d --build
# open http://localhost:8000 in browser
# click TestProc in sidebar → main tab opens via openObjectTab
# now inspect how regular object tabs are structured vs. our detail-panel
```

Grep for the pattern:
```bash
grep -n 'openTab\|createTab\|tab-panel' ui/static/js/src/50-ui-tabs.js | head -20
```

## Other known issues (deferred, tracked in review)

These were flagged by review but left for follow-up (not blocking):
- Chart.js → Canvas2D (design said Chart.js, we did Canvas2D) — undocumented scope change.
- Message Log virtualization is `slice(-500)` not scroll-aware.
- LGPL headers inconsistent in `internal/trace/` (poller.go has them, siblings don't).
- `serverName = serverID` placeholder in HandleTraceEvents.
- Log filter without input debounce.
- CSS class injection via `rec.type` containing whitespace.
- Playwright E2E missing force/unforce right-click flow.

## Key files — mental map

**Backend (Go):**
- `internal/debug/` — Snapshot adapter over `/<Object>/dump`.
- `internal/trace/` — full Spec 2 backend (types/client/poller/manager).
- `internal/api/handlers_debug.go` — HandleSnapshot.
- `internal/api/handlers_trace.go` — HandleTraceEvents SSE + Enable/Disable proxy.
- `internal/api/handlers.go:30` — `Handlers` struct (fields debugClient, traceMgr, traceResolver, httpClient).
- `internal/api/sse.go` — EventTrace constant, traceOnly filter, AddTraceClient, BroadcastTraceBatch.
- `internal/api/server.go` — 4 new routes.
- `cmd/server/main.go` — debugResolverAdapter reused for trace + graceful shutdown.

**Frontend (vanilla JS):**
- `ui/static/js/src/60-detail-state.js` — localStorage (300ms debounce).
- `ui/static/js/src/60-detail-panel.js` — CustomEvent listener + tab lifecycle.
- `ui/static/js/src/60-detail-variables.js` — snapshot poll + render + force/unforce.
  - NOTE: `renderVariables` was renamed to `renderDetailVariables` (commit `cfc7c5e`) to avoid clash with existing `51-ui-render.js::renderVariables`.
- `ui/static/js/src/60-detail-trends.js` — client-side live buffer.
- `ui/static/js/src/60-detail-messagelog.js` — trace SSE, Enable/Disable, CSV, filter.

**Tests:**
- `tests/unit/detail-*.test.js` — 10 files, 69 tests.
- `tests/single/detail-panel.spec.ts` — 5 Playwright specs (3 failing, 2 passing).

**Mock server:**
- `tests/mock-server/server.js` — stubs for `/snapshot`, `/api/trace/events` (SSE), `/api/trace/servers/.../enable|disable`.

**Design + plan docs:**
- `docs/superpowers/specs/2026-04-19-uobject-debug-spec4-design.md`
- `docs/superpowers/plans/2026-04-19-uobject-debug-spec4.md`
- `docs/superpowers/plans/2026-04-19-uobject-debug-spec4-phase0-notes.md`
- `docs/DocPages/UObject-debug-detail-panel.md` — user-facing.

## Recommended next steps

1. **Investigate E2E failure** — `docker compose up dev-viewer -d --build`, open TestProc in browser, compare tab layout vs. what `createDetailTabDOM` produces.
2. **Decide:** refactor to use `openTab()` from `50-ui-tabs.js` (recommended, larger), or tune standalone CSS (smaller, riskier).
3. **Apply fix, re-run `make js-tests`.** Target: 414 passed / 0 failed (recording spec pre-existing).
4. **Optional:** address deferred items from review list (LGPL headers, Chart.js documentation, etc.).
5. **Final:** squash the 30+ commits into one clean squash commit, create PR to master.

## Workflow reminders

- Project git convention: **no `Co-Authored-By: Claude`** on uniset-panel commits.
- Always use `-mod=vendor` for `go` commands.
- `make js-tests` = full E2E in Docker (~2 minutes; builds image each run).
- `npm run test:unit -- --run` in `tests/` directory = Vitest.
- `cd ui && go run concat.go` = regenerate `app.js` from `ui/static/js/src/*.js`.
- Primary branch in this session: `story/uobject-debug-spec4`. Backup tag exists at `backup/pre-squash-spec3` (from prior squash work).

## Auto mode preference

User has auto mode enabled — execute fixes autonomously, minimize interruptions, report outcomes. Escalate only for destructive operations (push, merge, force-push) or when truly blocked.
