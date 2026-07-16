# Claude session viewer

Maestro Mini includes a local, read-only viewer for native Claude Code
sessions. It shows root sessions and subagent trees, timing, status, token
usage, and bounded conversation transcripts. The executable contains the web
application, so Node.js is not needed at runtime.

## Run it

From the repository root:

```sh
go run ./cmd/traceui
```

TraceUI listens on `127.0.0.1:7777`, prints the browser URL and resolved
session directory, and refreshes as Claude Code updates session files. Open the
printed URL in a browser. Stop the process with Ctrl-C.

The session directory is selected in this order:

1. `--root PATH`;
2. `$CLAUDE_CONFIG_DIR/projects`; then
3. `$HOME/.claude/projects`.

Choose another loopback address or an available ephemeral port with `--addr`:

```sh
go run ./cmd/traceui --root /path/to/claude/projects --addr 127.0.0.1:0
```

TraceUI rejects non-loopback addresses. The root must already exist and be a
directory.

## Install the command

Install a self-contained executable with:

```sh
go install ./cmd/traceui
```

Run `$GOBIN/traceui`, or the `traceui` executable in the default Go binary
directory. The installed command can run outside the repository because its
frontend assets are embedded.

## Privacy and security

TraceUI reads the selected Claude Code session files and does not modify them.
It creates no index, database, journal, or analytics file and makes no outbound
network request. List and tree views contain derived metadata; opening detail
shows native conversation text in the local browser.

Anyone who can access the listening port can read displayed session content.
Keep the default loopback binding, and do not expose it through a proxy or port
forward. Treat screenshots and copied transcript text as sensitive.

## Develop and verify

The Go server lives under `cmd/traceui` and `internal/traceui`. The typed
frontend source lives under `web/traceui`; generated, embedded assets live
under `internal/traceui/web`.

The [provenance receipt](traceui/provenance.md) records source authority, the
extraction baseline, Geist font redistribution, and the synthetic-fixture
review.

Run all repository checks (this installs the pinned frontend dependencies):

```sh
make validate
```

After changing the frontend, regenerate the embedded assets:

```sh
make traceui-assets
```

Commit source and the regenerated files under `internal/traceui/web`, but not
`web/traceui/node_modules` or `web/traceui/dist`. A clean regeneration should
leave no Git diff.

## Troubleshooting

- `cannot locate Claude projects`: pass `--root`, set `CLAUDE_CONFIG_DIR`, or
  ensure `HOME` is set.
- `open Claude projects root ...`: create or select the correct native Claude
  projects directory.
- `bind: address already in use`: stop the existing listener, choose another
  loopback port, or pass `--addr 127.0.0.1:0`.
- An empty page with no sessions usually means the selected root has no native
  Claude Code JSONL sessions yet.
