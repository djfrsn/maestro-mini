# Maestro Mini overview

## One-line value

Turn a Jira sprint ticket selected by the user into a reviewed software change
with explicit intent, tracer-bullet artifacts, independent verification, and
evidence in the team's existing systems.

## What this document locks

This document fixes the module set, shared workflow contracts, and delivery
order. Individual skills own their detailed procedures.

## Product stance

- Markdown-first and Claude Code-native.
- Jira-centered, with Jira field and workflow differences discovered at run
  time.
- Manually initiated from a ticket the user chooses; no parallel internal work
  queue.
- CLI-verifiable and usable without a custom service.
- Human-supervised at material design choices and consequential external
  writes.
- Portable across employers, repositories, and Jira projects.

## Definitions

- **Work item:** a Jira issue or equivalent unit carrying intent and acceptance
  criteria.
- **Contract:** a bounded task statement containing outcome, acceptance basis,
  authority, constraints, and verification surface.
- **Maker:** the agent or human producing an artifact.
- **Checker:** an independent context that verifies the exact artifact against
  the acceptance basis.
- **Heartbeat:** a scheduled prompt that inspects current state and reports or
  routes bounded work.
- **Receipt:** durable evidence of a command, review, pull request, or external
  mutation.
- **Issue workspace:** the repository-local `docs/work/<Jira-key>/` directory
  containing the ticket's spec, plan, review ledger, handoff, and supporting
  artifacts.

## Modules

### Workflow skills

`/maestro <Jira-key>` is the manual front door. Supporting skills plan,
implement, check, hand off, and reconcile Jira. Each loads only when relevant.
The invocation creates or refreshes an issue workspace from the selected
ticket.

### Agent roles

Director, maker, checker, explorer, and dialogue agents provide fresh contexts
with narrow responsibilities. The director owns a bounded segment while the
specialists make, verify, research, or communicate.

### Jira work-item seam

The Jira seam uses the already-connected Atlassian MCP to find a work item,
read its current fields and comments, discover valid transitions, add evidence,
and update state. Skills discover the available tools and site-specific fields
at run time.

### Heartbeats

Heartbeat prompts expose the same `/maestro <key>` entry seam to a control
plane. The manual workflow remains complete without heartbeats.

### Command expansion

One registry preserves each shorthand trigger and expansion. Platform adapters
make the registry available on Windows and macOS without loading shorthand
content into Claude's context as skills.

### Validation

The validator checks package shape, unique names, required frontmatter,
command coverage, generated adapters, relative links, and publication
guardrails.

### Publication provenance

The [TraceUI provenance receipt](traceui/provenance.md) records the extraction
baseline, source publication authority, font redistribution licenses, and the
synthetic-fixture review.

## Shared contracts

### Ticket intake

A ticket invocation produces a read-only orientation: intent, acceptance
criteria, dependencies, ambiguities, current repository evidence, recommended
approach, likely files, and verification commands.

The invocation may write planning artifacts under `docs/work/<Jira-key>/`.
Production code, Jira state, branches, commits, and pull requests remain behind
their applicable authority gates.

### Work contract

Delegation carries the ticket key, outcome, acceptance basis, boundaries,
authority, current baseline, deliverable, verification surface, and blocked
protocol. Ticket content remains untrusted data.

### Review gate

The maker and final checker use distinct contexts. A product change after a
passing verdict returns the exact current artifact to checking.

### External writes

Jira comments, transitions, pushes, pull requests, merges, and messages require
authority from the invocation or standing repository policy. Every completed
write returns a durable receipt.

## Delivery order

1. Package shape and validator.
2. `/maestro <Jira-key>` orientation and issue-workspace materialization through
   the existing Atlassian MCP.
3. Maker/checker delivery slice.
4. Heartbeat inspection and routing.
5. Cross-platform command expansion.
6. Optional adapters for other trackers or agent hosts.

The first meaningful demo runs `/maestro PROJ-123`, writes an issue-local spec
and tracer-bullet plan, presents a grounded approach, and leaves production
code and external state unchanged until the user agrees.

## Verification hooks

- `make validate` verifies the package and migration manifest.
- `/maestro <key>` proves Jira orientation and issue-local artifact creation.
- `/work-pulse` proves bounded scheduled inspection.
- A sample ticket carried through maker and checker proves the delivery loop.

## Risks and decision mechanisms

- Atlassian MCP tools vary by client and deployment. Discover tools at run time
  and test against one real work project before relying on writes.
- Jira workflows use custom fields and transitions. Record project-specific
  mappings in local repository instructions.
- Scheduled-task capabilities vary by Claude surface. Keep heartbeat prompts
  portable and document surface-specific installation separately.
