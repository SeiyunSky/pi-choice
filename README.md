# pi-choices

A [Pi](https://pi.dev) extension that presents structured question forms inside a Pi agent session — letting the agent collect user decisions before continuing.

## Why

When an agent needs multiple decisions from you (feature flags, configuration choices, design options), the normal back-and-forth conversation is slow and easy to lose track of. `pi-choices` pops up a focused TUI form, collects all answers, then returns structured data so the agent can proceed.

## Question types

### Radio — single choice
```
Which DELETE scope should be protected?
  ● All DELETE statements
  ○ Only DELETE without WHERE clause
```

### Checkbox — multiple choice (space to toggle, enter to confirm)
```
Which features do you want to include?
  ☑ Session Library
  ☑ Diagram Gallery
  ☐ Translation Studio
  ☑ MCP Browser
```

### Input — free text
```
What should the default target language be?
  > Chinese _
```

All three types support an **"Other…"** option (`allowOther: true`) that expands into a free-text field when selected.

Questions are shown **one at a time** with a `Question N / Total` progress indicator.

## Usage — agent tool call

The extension registers a `pi_choices` tool. The agent calls it like:

```json
{
  "questions": [
    {
      "type": "radio",
      "id": "delete_scope",
      "question": "Which DELETE scope should be protected?",
      "options": ["All DELETE statements", "Only DELETE without WHERE clause"]
    },
    {
      "type": "checkbox",
      "id": "features",
      "question": "Which features do you want to include?",
      "options": ["Session Library", "Diagram Gallery", "Translation Studio", "MCP Browser"]
    },
    {
      "type": "input",
      "id": "default_lang",
      "question": "What should the default target language be?",
      "placeholder": "e.g. Chinese"
    }
  ]
}
```

Returns:

```json
{
  "delete_scope": "All DELETE statements",
  "features": ["Session Library", "Diagram Gallery", "MCP Browser"],
  "default_lang": "Chinese"
}
```

If the user presses `Esc` at any point, the tool returns `"User cancelled the choices form."`.

## Usage — other extensions (bridge)

`pi-choices` exports a bridge so other packages can use it without import coupling:

```ts
import type { ChoicesBridge } from "pi-choices/lib/choices.ts";

const CHOICES_BRIDGE_KEY = Symbol.for("pi-choices.bridge.v1");
const bridge = (globalThis as any)[CHOICES_BRIDGE_KEY] as ChoicesBridge | undefined;

if (bridge) {
  const answers = await bridge.ask(ctx, [
    { type: "radio", id: "confirm", question: "Proceed?", options: ["Yes", "No"] },
  ]);
}
```

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate options |
| `Space` | Toggle checkbox item |
| `Enter` | Confirm selection / submit input |
| `Esc` | Cancel and abort the entire form |

## Installation

```bash
pi install npm:pi-choices
```

Or from GitHub:

```bash
pi install git:github.com/SeiyunSky/pi-choice
```

## Requirements

- Pi `>= 0.85.0`
- Node.js `>= 18`

## License

MIT
