# TraceUI extraction map

This reference maps the current Maestro implementation into the focused
Maestro Mini package. It is an implementation aid; the spec owns product
behavior and the plan owns delivery order.

## Source-to-target map

| Maestro source | Maestro Mini target | Treatment |
| --- | --- | --- |
| `internal/session/provider.go` | `internal/session/provider.go` | Keep the interface, make transcript and summary operations explicit, and carry one `Claude` implementation. |
| `internal/session/claude.go` | `internal/session/claude.go` | Extract native file discovery, path identity, record projection, status, usage, and subagent correlation. Remove Codex launch-marker recognition. |
| `internal/session/claude_transcript.go` | `internal/session/claude_transcript.go` | Extract bounded native conversation rendering and its privacy tests. |
| `internal/session/types.go` | `internal/session/model.go` | Keep the neutral status, confidence, usage, record, node, tree, export, and transcript models needed by the API. Rename schemas and remove index, heartbeat, and invocation contracts. |
| `internal/session/discover.go` | `internal/session/store.go` | Keep provider-driven scan, root/child adjacency, malformed visibility, path lookup, and deterministic order. Remove heartbeat lookup and default Codex wrappers. |
| `internal/session/summary.go` | `internal/session/summary.go` | Keep `FileSummary`, Claude summary projection, and descendant counting. Remove Codex bounded-scan code. |
| `internal/session/tree.go` | `internal/session/tree.go` | Keep single-store reconstruction and cycle protection. Remove cross-store resolution and directory defaults. |
| `internal/session/detail.go` | `internal/session/detail.go` | Keep safe derived detail and event-kind counts. |
| `internal/session/export.go`, `encode.go` | `internal/session/contract.go` | Keep only canonical tree response projection and deterministic encoding used by the server. |
| `internal/session/transcript.go` | `internal/session/transcript.go` | Keep the neutral transcript model and dispatcher; pair it directly with the Claude implementation. |
| `internal/session/testdata/claude-*` | `internal/session/testdata/claude-*` | Recreate as synthetic publication-safe fixtures with the minimum records needed for each behavior. |
| `internal/traceui/cache.go` | `internal/traceui/cache.go` | Reduce to one provider/root; retain stat signatures, unchanged-file reuse, malformed isolation, aggregation, immutable snapshots, and the 15-minute unfinished-session lease derived from Claude's final native record timestamp. |
| `internal/traceui/server.go` | `internal/traceui/server.go` | Keep list, tree, detail, SSE, loopback server lifecycle, JSON errors, and embedded UI. Remove A2A, wide-event, legacy index, and multi-source paths. |
| `internal/traceui/server_v1.go` | `internal/traceui/site.go` | Serve the typed SSR shell at `/` and content-hashed assets at `/assets/`. |
| `internal/traceui/sse.go` | `internal/traceui/sse.go` | Keep bounded change broadcasting and keep-alives. |
| `internal/traceui/embed_v1*.go` | `internal/traceui/embed.go` | Keep production embedding plus a focused development asset seam if the build workflow requires it. |
| `internal/traceui/web-v1/src` | `web/traceui/src` | Keep sessions, virtualization, waterfall, detail, signals, API resource cache, and SSE refresh. Remove multi-provider and telemetry views. |
| `internal/traceui/web-v1/{build.mjs,package*.json,tsconfig*,biome.json,.oxlintrc*}` | `web/traceui/` | Retain pinned deterministic build and verification tooling with portable names and paths. |
| `internal/traceui/web-v1/src/fonts` | `web/traceui/src/fonts` | Carry only after license and redistribution provenance are confirmed. |
| `internal/traceui/web-v1/dist` | `internal/traceui/web` or another declared embed root | Track reproducible content-hashed runtime assets; exclude dependency directories. |
| `internal/gbcli/sessions.go` | `cmd/traceui/main.go` | Recreate the minimal serve command, root precedence, signal shutdown, and actual-address output. |

## Omitted source modules

| Maestro source | Reason |
| --- | --- |
| `internal/session/parse.go` | Native Codex rollout parser. |
| Codex portions of `provider.go`, `summary.go`, and `transcript.go` | Removed provider implementation. |
| `internal/session/resolve.go` | Cross-provider invocation and parent resolution. |
| `internal/session/a2a.go` | Codex debug-journal surface. |
| `internal/session/index.go` | Disposable file index outside the live viewer contract. |
| `internal/traceui/gbevents.go` and `internal/wideevent` | Gigabrain telemetry console and storage. |
| `internal/traceui/contract_gen.go` wide-event types | GB Events frontend contract generation. Session contract generation may be rebuilt narrowly. |
| `internal/traceui/web/` | Legacy JavaScript frontend. |
| `internal/gbcli` outside the serve lifecycle | Gigabrain command suite and repository environment integration. |
| launchd, Tracebar, stress tools, and PMVP artifacts | Product-specific operations and historical planning evidence. |

## Frontend reduction checklist

- Keep: `app`, session row, store, API, resource cache, SSE, virtual list,
  waterfall, detail, tooltip, formatting, clipboard, shared components, fonts,
  and base styles.
- Delete: GB Events components and types, metrics/feed API calls, view switcher,
  provider chips, heartbeat filter and badges, Codex color tokens, and telemetry
  styles.
- Rename: package description, local-storage keys, page title, schema labels,
  Go-generated contract imports, and comments carrying private project history.
- Verify: keyed expansion, virtual row measurement, live waterfall replacement,
  transcript follow-scroll, disclosure state, text rendering, and content-hashed
  asset loading.

## Portability guard

The final application-code scan covers `cmd/traceui`, `internal/session`,
`internal/traceui`, `web/traceui/src`, and generated runtime assets. It flags
case-insensitive references to:

```text
gigabrain
github.com/gigabrain-os
codex
openai
GB Events
wideevent
A2A
PMVP-
```

Documentation may name source concepts when explaining provenance or scope.
Application errors, help, browser copy, comments, schemas, storage keys, and
generated bundles use the portable TraceUI vocabulary.

## Provenance receipt

The [TraceUI provenance receipt](../provenance.md) records:

- ownership or license basis for the Go and TypeScript source;
- the license and redistribution basis for each font;
- the extraction baseline and supplemental portable-fix commits; and
- the fixture review confirming that every committed native record is synthetic
  and contains no employer, user, repository, credential, or production-session
  content.
