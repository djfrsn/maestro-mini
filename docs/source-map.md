# Workflow source map

The public package preserves every agent and skill capability in the current
workflow baseline while replacing repository-specific state, paths, commands,
and provider formats with Claude Code Markdown.

## Agents

| Source role | Public Claude agent | Disposition |
| --- | --- | --- |
| checker | `checker` | Generalized |
| dialogue | `dialogue` | Generalized |
| director | `director` | Generalized |
| explorer | `explorer` | Generalized |
| maker | `maker` | Generalized |

## Skills

| Source capability | Public Claude skill | Disposition |
| --- | --- | --- |
| checking | `checking` | Generalized |
| chief-of-staff | `chief-of-staff` | Generalized heartbeat coordinator |
| comms | `comms` | Generalized external communication contract |
| grading | `grading` | Generalized session and artifact rubric |
| maestro | `maestro` | Retained as the manual `/maestro <Jira-key>` front door |
| planning | `planning` | Generalized with Jira issue workspaces |
| simplify-skill | `simplify-skill` | Generalized removal accounting |
| swe-acceptance-testing | `acceptance-testing` | Renamed and generalized |
| swe-checking | `checking` | Consolidated into the artifact checker |
| swe-engineering | `engineering` | Renamed and generalized |
| triage | `triage` | Generalized for manually selected sprint work |

## Heartbeats

The public `chief-of-staff` and `work-pulse` skills expose one bounded wake to a
control plane through the prompts under `heartbeats/`.

## Text replacements

The live source inventory and platform-neutral expansions are recorded in
[`text-replacements/manifest.json`](../text-replacements/manifest.json). Every
entry can be generated for Windows and macOS without becoming a Claude skill.
