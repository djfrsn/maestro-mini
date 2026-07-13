# Heartbeats

Heartbeats are optional scheduled prompts that invoke an explicit skill. The
manual workflow begins from a sprint ticket the user chooses. Install heartbeat
prompts when a control plane supplies scope and ticket selection.

- `chief-of-staff.md` runs one configured coordination wake.
- `jira-work-pulse.md` evaluates one selected work scope.
- `review-pulse.md` evaluates one selected review scope.

The prompts default to read-only behavior. Add standing write authority only
for a specific action and destination. Keep employer names, project keys,
restricted URLs, and credentials in local configuration.
