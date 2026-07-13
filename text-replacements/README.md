# Shorthand commands

`manifest.json` is the canonical registry for workflow prompts, phrases, and
symbols. Shorthands remain outside `.claude/skills/`, so they add no skill-list
or invocation context to Claude.

## Recommended setup: Espanso

[Espanso](https://espanso.org/) is open source and supports Windows and macOS.
The generated `espanso/maestro-mini.yml` provides two entry paths:

- Type an original trigger such as `;own` or `;debug` to expand it directly.
- Type `;cmd` to open a labeled picker containing every registered command.

Install Espanso, copy `espanso/maestro-mini.yml` into its `match` directory,
and restart Espanso. Run `python scripts/generate_expansions.py --check` after
editing the registry.

macOS users can continue using native text replacements. The trigger and
replacement columns in `manifest.json` are the portable source for maintaining
those entries. Espanso offers the same registry and picker on both operating
systems.

## Other Windows choices

- **[Beeftext](https://beeftext.org/):** simple open-source system-wide
  substitutions and a combo picker.
  It is the smallest Windows-only replacement for native macOS substitutions.
- **[AutoHotkey v2](https://doggy8088.github.io/AutoHotkeyDocs/docs/Hotstrings.htm):**
  supports exact hotstrings and can bind Tab as an end key. An inline suggestion
  list requires custom keyboard-hook and GUI code.
- **[PowerToys Command Palette](https://learn.microsoft.com/windows/powertoys/command-palette/overview):**
  the strongest Windows-native foundation for a searchable Maestro command
  extension. It uses a separate palette rather than completing text inline.
- **Custom utility:** an exact `;cmd` plus Tab autocomplete can be built, but it
  needs global input capture, focused-app text insertion, accessibility
  permissions, packaging, signing, and enterprise endpoint approval.

The Espanso adapter is the first release. A PowerToys extension is the most
promising next step if a richer Windows-native picker proves valuable.

## Registry

| Trigger | Command |
| --- | --- |
| `;handoff` | handoff |
| `;plan` | plan-work |
| `;demo` | demo |
| `;diff` | review-diff |
| `;land` | land |
| `;build` | build |
| `;own` | own |
| `;min` | minimum-change |
| `;mi` | minimum-proposal |
| `;study` | study |
| `;debug` | debug |
| `;comp` | compare |
| `;explain` | explain |
| `;spawn` | spawn |
