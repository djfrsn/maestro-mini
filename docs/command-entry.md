# Command entry options

Maestro Mini separates durable workflows from typing shortcuts. Claude skills
hold procedures whose instructions should remain active during a task. The
command registry holds text that only needs to be inserted once.

## Current choice

[Espanso](https://espanso.org/docs/matches/basics/) is the cross-platform
adapter for the first release. It supports direct system-wide triggers, search
labels, and match disambiguation on Windows and macOS. The shared `;cmd` trigger
opens the registry through disambiguation, while original triggers remain
available for muscle memory.

## Exact inline autocomplete

An experience where typing `;bu` opens suggestions and Tab completes `;build`
is a separate input-method product. It must observe global keystrokes, render a
window near the text caret, retain focus correctly, insert text into arbitrary
applications, and satisfy operating-system accessibility and security policy.

If that experience becomes important, evaluate in this order:

1. A [PowerToys Command Palette extension](https://learn.microsoft.com/windows/powertoys/command-palette/extensibility-overview)
   for a supported Windows-native picker.
2. A small [AutoHotkey](https://doggy8088.github.io/AutoHotkeyDocs/docs/Hotstrings.htm)
   prototype to validate trigger, ranking, and insertion UX.
3. A signed cross-platform utility only after the prototype proves that an
   inline popup materially beats Espanso's picker.

The registry remains the stable seam for every option.
