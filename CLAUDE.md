# Repository instructions

Maestro Mini is programmed in Markdown first. Keep agents and skills portable
across repositories and avoid organization-specific names, paths, statuses,
credentials, or tool identifiers.

## Engineering rules

- Prefer declarative workflow contracts over platform-specific prose.
- Treat Jira fields, status names, and MCP tool names as discovered data.
- Preserve maker/checker independence in every delivery workflow.
- Stage only explicit files. Preserve unrelated work in shared checkouts.
- Run `make validate` after changing an agent, skill, heartbeat, or command.
- Confirm before committing in interactive sessions.

## Writing rules

Write current behavior directly. Use domain nouns and action verbs. Keep
instructions concise enough that each line changes agent behavior.
