# Generate interactive business report skill

Create secure, standalone HTML business reports from an analysis, dataset, or
completed research conversation. The generated report embeds its charts, data,
styles, and interactions, so readers need only the resulting `.html` file.

The repository is one portable Agent Skill. `SKILL.md` is the cross-platform
contract. `agents/openai.yaml` is optional OpenAI integration metadata; Claude
and Snowflake do not use it for discovery.

## Capabilities

- Purpose-adaptive standard, executive-brief, analytical-narrative, and
  operational-review compositions with an optional opening.
- Thirteen validated chart families plus controlled embedded PNG/JPEG content
  images, logos, and specialized figures.
- Section-level linked filters, chart-to-table drill-down, searchable tables,
  comparison views, responsive layouts, and accessible no-JavaScript fallbacks.
- Validated text, number, integer, percent, currency, date, datetime, duration,
  and boolean columns.
- Audience-aware narrative and optional localized interface labels for reports in
  user-requested languages.
- Offline output with a restrictive Content Security Policy and no runtime
  network requests.
- Validated brand, semantic-color, typography, and layout customization through
  `theme.json`.

## Install

| Platform | Installation |
| --- | --- |
| ChatGPT or Codex | Copy this repository to a recognized skills directory, or distribute it as an OpenAI plugin. `agents/openai.yaml` supplies optional UI metadata and enables automatic selection for explicit HTML business-report requests. |
| Claude Code | Copy or link the repository as `.claude/skills/generate-interactive-business-report` in a project, or `~/.claude/skills/generate-interactive-business-report` for personal use. |
| Claude Cowork | Upload or enable the skill through Claude's Customize/Skills interface. Cowork does not read a machine's `~/.claude/skills` directory. |
| Snowflake CoWork | Upload the skill folder from **Capabilities > Skills**. Enable Cortex Agent code execution because report generation runs Python. |
| Snowflake Cortex Agents or Cortex Code | Register the repository from Git, a local folder, or a Snowflake stage. These products discover the root `SKILL.md`. |

Python 3.10 or later is the only runtime requirement. Node.js and Playwright are
needed only to maintain the packaged browser code and run visual tests.

## Generate a report

Create a JSON specification following `report-specification.md`, then run:

```bash
python -B scripts/render_html_report.py report-specification.json report.html
```

Start with `examples/minimal-reference-fixture.json`. Use the richer fixtures only for
the specific capabilities they demonstrate; they are not report outlines.

Validate without writing output:

```bash
python -B scripts/render_html_report.py report-specification.json report.html --check
```

## Customize the theme

Copy `theme.json`, change the tokens, and pass the copy to the renderer:

```bash
python -B scripts/render_html_report.py report-specification.json report.html --theme my-theme.json
```

The configuration supports light or dark mode, brand and semantic colors, text and number font
stacks, content width, reading width, spacing, and corner radius. Hex colors,
font names, numeric bounds, and essential contrast pairs are validated before
the report is built. The agent may derive these tokens from supplied brand guidance.
Custom CSS and JavaScript are intentionally unsupported.
See `report-design.md` and `theme.schema.json` for the contract.

## Embed an image

Validate and encode a local PNG or JPEG before adding it to an `image`, `figure`, or
`meta.logo` object:

```bash
python -B scripts/encode_image.py path/to/image.png --pretty
```

The result remains inside the standalone HTML. External image URLs and local file
paths are rejected. This skill produces HTML only; it does not create companion PDF,
CSV, spreadsheet, or slide files.

## Develop and verify

Run the Python package tests:

```bash
python -B -m unittest discover -s tests -v
```

Run the browser and accessibility suite:

```bash
npm ci
npx playwright install chromium
npm run test:ui
```

The ECharts bundle is pinned under `vendor/`. Review `security-notes.md` before
changing the renderer, schema, CSS, or controllers.

## License

No open-source license has been selected yet. Add a `LICENSE` file before public
distribution so users know what reuse is permitted.
