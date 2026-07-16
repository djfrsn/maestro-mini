# Claude Code session storage contract

Verified: 2026-07-15

Authority: official Claude Code documentation

This reference records the external storage assumptions TraceUI relies on. The
implementation uses synthetic fixtures as its executable compatibility basis
and rechecks these sources when Claude Code changes the native format or
location.

## Confirmed assumptions

- Claude Code CLI stores session transcripts as JSONL under
  `~/.claude/projects/<project>/<session-id>.jsonl` by default.
- `CLAUDE_CONFIG_DIR` replaces the `~/.claude` configuration base, so the
  corresponding transcript root is `$CLAUDE_CONFIG_DIR/projects`.
- Transcript records can contain messages, tool calls, tool results, command
  output, pasted content, and credentials exposed to a tool or terminal.
- Native session history is plaintext and protected by operating-system file
  permissions.
- Claude Code can remove session files according to `cleanupPeriodDays`; the
  documented default is 30 days.
- Claude Code CLI, desktop, web, and editor surfaces maintain distinct session
  histories. This extraction supports the CLI storage contract above.

## Design consequences

- Root precedence follows `--root`, `CLAUDE_CONFIG_DIR`, then `~/.claude`.
- TraceUI binds to loopback and emits no network request.
- Tests and committed evidence use synthetic transcripts.
- List and tree logs remain metadata-only; local detail responses are the
  explicit text-bearing surface.
- Source disappearance is normal retention reconciliation rather than durable
  archival loss, because TraceUI keeps no derived database.
- Support claims attach to the documented CLI store and tested fixtures rather
  than every Claude application.

## Sources

- [Explore the `.claude` directory](https://code.claude.com/docs/en/claude-directory)
- [Manage sessions](https://code.claude.com/docs/en/sessions)
- [Claude Code environment variables](https://code.claude.com/docs/en/env-vars)
