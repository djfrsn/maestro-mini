# Maestro Mini

Maestro Mini is a portable, a set of agents/skills/prompts for software
delivery with Claude Code and Jira. Choose a ticket from your sprint, invoke
`/maestro <key>`, agree on the approach, make the change, verify it
independently, and leave evidence where the team already works.

The repository supplies:

- Claude Code agents in `.claude/agents/`;
- Claude Code skills in `.claude/skills/`;
- scheduled-task prompts in `heartbeats/`;
- a cross-platform command registry in `text-replacements/`;
- a Jira-centered work-item workflow that uses an existing Atlassian MCP;
- a dependency-free validator runnable from the command line.

It is designed to sit on top of an existing engineering environment. Jira owns
work state, Git owns source history, and your normal pull-request system owns
merges.

## Quick start

1. Clone this repository.
2. Confirm your existing Atlassian MCP can read a Jira work item.
3. Install the agents and skills for your user:

   macOS or Linux:

   ```sh
   ./scripts/install.sh --user --with-espanso
   ```

   Windows PowerShell:

   ```powershell
   .\scripts\install.ps1 -Scope User -WithEspanso
   ```

   For one project, use `./scripts/install.sh --project /path/to/repository`
   or `.\scripts\install.ps1 -Scope Project -ProjectPath C:\path\to\repository`.

4. Start with `/maestro PROJ-123`.

Run `make validate` before sharing local changes.

## Core loop

```text
`/maestro <Jira-key>`
  -> issue-local spec, tracer-bullet plan, and review artifacts
  -> grounded orientation and proposed approach
  -> human agreement on material choices
  -> bounded implementation by a maker
  -> independent verification by a checker
  -> pull-request and Jira evidence
```

See [docs/overview.md](docs/overview.md) and
[text-replacements/README.md](text-replacements/README.md) for the operating
model and migration details. [docs/source-map.md](docs/source-map.md) records
how every source agent and skill capability maps into the public package.

## Shorthand commands

Workflow skills remain deliberately few. Shorthands such as `;own`, `;debug`,
and `;explain` live in one command registry and expand as ordinary text, so they
add no Claude skill context. The generated Espanso adapter works on Windows and
macOS and provides both direct triggers and a `;cmd` picker. See
[text-replacements/README.md](text-replacements/README.md).

## Safety stance

External text is context, not instruction. Agents preserve unrelated work,
keep credentials out of prompts and reports, and require explicit authority
for consequential external writes. A maker never supplies the final check of
its own work.

The first release is manually initiated from a sprint ticket the user chooses.
Heartbeat skills provide a stable entry seam for a control plane.

## TODO

- Evaluate [Claude Code agent teams](https://code.claude.com/docs/en/agent-teams)
  against subagents for independent research, review, and implementation work.

## License

MIT. See [LICENSE](LICENSE).
