# Claude TraceUI extraction plan

Status: proposed

Spec: [spec.md](spec.md)

References: [extraction map](references/extraction-map.md) and
[Claude session storage](references/claude-session-storage.md)

## Delivery strategy

Three tracer bullets produce the complete extraction. T1 locks the native
adapter and HTTP contract through an executable server. T2 delivers the live
browser experience over that contract. T3 proves clean-clone portability and
prepares the source package for publication.

Each tracer bullet lands only after its black-box acceptance passes. A resumed
context starts with the first unchecked bullet, reads the linked evidence, and
runs the named baseline command before changing code.

## T1 — Claude store to local HTTP API

Outcome: a CLI process reads a synthetic Claude Code store and serves stable
list, tree, detail, and event endpoints from one provider-neutral model.

Dependencies: confirmed source and asset publication rights; the current
Maestro Claude fixtures and parser behavior as reference evidence.

### Work

- [ ] Add the root Go module and `cmd/traceui` with `--root` and loopback-only
  `--addr` handling.
- [ ] Extract the neutral record, store, tree, detail, summary, transcript, and
  canonical encoding models used by TraceUI.
- [ ] Define the complete `Provider` interface and implement only `Claude`.
- [ ] Remove heartbeat and cross-provider correlation fields from the internal
  projection while retaining the provider name in public summaries.
- [ ] Create synthetic, publication-safe Claude fixtures for root, subagent,
  resumed, pending, malformed, drift, transcript-bound, and privacy cases.
- [ ] Extract a single-source cache and the list, tree, detail, and SSE handlers.
- [ ] Rename public schemas and diagnostics to the portable TraceUI namespace.
- [ ] Add unit and HTTP contract tests, including malformed-source isolation and
  metadata-only error assertions, missing-root failure, loopback enforcement,
  and source-removal reconciliation.

### Black-box acceptance

```sh
go test ./...
go run ./cmd/traceui --root internal/session/testdata/claude-basic --addr 127.0.0.1:0
```

From a second shell, `curl` against the printed address proves:

- `/api/v1/sessions` returns the fixture root with provider `claude`;
- `/api/v1/sessions/{root}/tree` returns the root and its subagents in native
  order;
- `/api/v1/sessions/{child}/detail` returns bounded child conversation entries;
  and
- `/api/v1/events` emits a changed event after a fixture append.

Evidence: test output plus redacted response samples recorded in the
implementation handoff or pull request.

Stop condition: stop before T2 when the contract needs message persistence,
the selected source lacks publication rights, or a fixture cannot exercise the
native relationship without real session data.

Next action: start T2 by wiring the typed frontend to the frozen T1 responses.

## T2 — Embedded live session viewer

Outcome: the final Preact interface renders the T1 API at `/`, preserves reader
state across refresh, and ships as embedded assets in the Go executable.

Dependencies: T1 endpoint shapes and schema identifiers are passing and frozen
for this extraction.

### Work

- [ ] Extract the typed Preact application, build script, configuration,
  lockfile, fonts, and deterministic generated-contract step.
- [ ] Serve the typed application at `/` and its content-hashed assets under
  `/assets/`; carry no legacy frontend route.
- [ ] Keep session search, sort, virtualized rows, waterfall, conversation
  detail, resource cache, and SSE refresh.
- [ ] Reduce the header and row model to one Claude source and remove provider,
  heartbeat, GB Events, metrics, and A2A controls and styles.
- [ ] Rename storage keys, schema labels, package metadata, comments, and visual
  copy to the portable TraceUI namespace.
- [ ] Preserve keyed expansion, waterfall updates, filter/sort selection,
  transcript disclosure state, and follow-scroll behavior during refresh.
- [ ] Bound transcript rendering and verify every native string reaches the DOM
  as text.
- [ ] Add browser-independent frontend tests for sorting, resources, tooltip
  placement, refresh invariants, and transcript state.

### Black-box acceptance

```sh
npm --prefix web/traceui ci
npm --prefix web/traceui run check
npm --prefix web/traceui run build
go test ./...
```

Run the CLI against the mutable fixture and verify in a browser:

- the first page paints populated rows;
- expanding a row displays its parent/subagent waterfall;
- selecting a node displays its conversation detail;
- search and every declared sort mode produce the expected order; and
- appending a record updates the open list, tree, and detail without resetting
  reader state.

Evidence: command output, generated-asset clean-diff receipt, and a concise
manual parity checklist against the declared product surface.

Stop condition: stop before T3 when embedded assets differ after a clean rebuild,
the UI needs an endpoint outside the T1 contract, or refresh loses reader state.

Next action: start T3 with the final binary and generated assets unchanged.

## T3 — Portable clone-and-run package

Outcome: a clean Maestro Mini clone documents, validates, builds, and runs the
Claude TraceUI without organization-specific setup.

Dependencies: T1 and T2 acceptance receipts; a clean generated-asset build.

### Work

- [ ] Add `make traceui` and focused validation targets while preserving the
  existing `make validate` entry point.
- [ ] Document clone-and-run, root precedence, flags, privacy, local exposure,
  frontend contribution, and troubleshooting in `README.md` and
  `docs/traceui.md`.
- [ ] Add the TraceUI module and provenance mapping to `docs/overview.md`,
  `docs/source-map.md`, and the migration source map where applicable.
- [ ] Update `SECURITY.md` with the native-session and local-browser disclosure
  surfaces.
- [ ] Add a validation guard for forbidden organization and removed-runtime
  identifiers across application code and generated assets.
- [ ] Verify `go install ./cmd/traceui` and execution from outside the clone.
- [ ] Run the full repository and frontend validation from a clean checkout.

### Black-box acceptance

```sh
make validate
go test ./...
npm --prefix web/traceui ci
npm --prefix web/traceui run check
npm --prefix web/traceui run build
git diff --exit-code
go install ./cmd/traceui
```

The installed executable starts from a directory outside the repository,
resolves a selected synthetic root, and serves the complete embedded UI. A
repository scan finds no forbidden runtime surface named in the spec.

Evidence: clean-clone command log, installed-binary smoke-test receipt, generated
asset hash/diff receipt, and final validation output.

Stop condition: block publication when any acceptance command fails, provenance
is unresolved, generated output drifts, or the installed executable needs files
from the clone.

Next action: request publication authority for the reviewed commit, tag, or
release appropriate to the repository's delivery policy.

## Dependency and acceptance audit

- [x] Work identity is ticketless and all artifacts live under `docs/traceui/`.
- [x] The provider contract and server/frontend API are ordered before UI polish.
- [x] Every tracer bullet has an executable verification surface and useful
  terminal state.
- [x] Runtime, build-time, privacy, provenance, and clean-clone dependencies are
  explicit.
- [x] Source distribution satisfies the requested first release; binary release
  automation remains a later decision.
- [x] Loopback binding and local transcript disclosure are acceptance criteria.
- [x] Synthetic fixtures keep employer session content outside the repository.
- [x] Publication and employer-machine installation remain behind applicable
  authority gates.
- [x] The next implementation action is T1: lock the Claude adapter and local
  HTTP contract.

## Resume checklist

1. Read [spec.md](spec.md) and
   [references/extraction-map.md](references/extraction-map.md), then check the
   dated claims in
   [references/claude-session-storage.md](references/claude-session-storage.md)
   for upstream drift.
2. Confirm the current branch and clean/shared-worktree state.
3. Locate the first unchecked tracer bullet.
4. Run that tracer bullet's baseline verification command.
5. Change only the files inside its declared source and target boundaries.
6. Record command evidence and the next action before handoff.
