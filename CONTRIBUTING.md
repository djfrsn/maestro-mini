# Contributing

Keep changes small, portable, and runnable.

1. Describe the supported workflow and observable outcome.
2. Change the smallest set of agents, skills, heartbeats, commands, or docs that
   owns it.
3. Add or update validator coverage when introducing a new convention.
4. Run `make validate`.
5. Open a pull request with the commands run and any unchecked surface.

Agent-facing files must contain no employer-specific data, credentials,
private URLs, internal project keys, or copied Jira content.
