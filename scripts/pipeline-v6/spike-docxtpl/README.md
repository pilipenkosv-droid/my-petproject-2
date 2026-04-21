# Spike: docxtpl assembler (pipeline-v6 Week 1)

## Goal

Validate that **docxtpl** (Python, LGPL) can render a structured .docx
from a Jinja-aware Word template + JSON context. Evaluate as a
**fallback assembler** for cases where Pandoc struggles (complex
multi-header tables, merged cells).

Feeds the comparison matrix in ADR-011 (Pandoc vs docxtpl vs raw OOXML).

## Stack

- Python 3.13.13 (uv-managed venv)
- docxtpl 0.20.2
- python-docx 1.2.0
- jinja2 3.1.6 / lxml 6.1.0

## How to run

```bash
cd scripts/pipeline-v6/spike-docxtpl
uv sync                       # installs deps from pyproject.toml
uv run python make-template.py   # regenerates template.docx
uv run python run.py             # renders out.docx + prints metrics
```

`make-template.py` is the source of truth for `template.docx` (kept for
reproducibility; `template.docx` is ~37 KB so also committed).

## Measured results (2026-04-21)

Context: 2 chapters, 3-row result table, 2 bibliography entries.

| Metric              | Value       |
|---------------------|-------------|
| render + save       | **12.8 ms** |
| out.docx size       | 37 442 B    |
| paragraphs          | 10          |
| headings            | 4           |
| tables              | 1 (4 rows = 1 header + 3 data) |

All loops resolved correctly, Cyrillic preserved, Heading 1 style
applied to chapter titles.

## Critical findings

### Works well
- **Paragraph loop** (`{%p for … %}` / `{%p endfor %}`) — cleanly
  expands heading + body per item. Good for chapters, bibliography.
- **Table row loop** (`{%tr %}`) — produces correct repeated rows with
  typed cells.
- **Russian text / UTF-8** — no encoding issues.
- **Performance** — ~13 ms for a small doc; negligible overhead for
  typical диплом (50–100 pages).
- Install on Python 3.13 clean (no C-ext build needed beyond lxml wheel).

### Limitations / gotchas
- **Template must be pre-built in Word/python-docx.** docxtpl cannot
  synthesise structure from scratch — every Heading style, table style,
  numbered list must already exist in the template file.
- **`{%tr %}` open and close tags MUST be in separate rows.** Placing
  both in the same `<w:tr>` causes docxtpl to delete the whole row and
  leak a stray `{% endfor %}` into the XML → Jinja `TemplateSyntaxError`.
  Discovered in this spike (see commit history).
- **TOC (Table of Contents) is NOT auto-generated.** docxtpl can insert
  a `TOC` field, but Word must be opened once to refresh it. For headless
  pipelines we need either (a) a LibreOffice `--headless --convert-to
  docx` post-pass, or (b) client-side “please press F9” UX.
- **OMML math formulas are not a first-class citizen.** docxtpl passes
  arbitrary XML via `{{r| subdoc }}` / `InlineImage`, but there's no
  helper for MathML/OMML. For formulas we'd still need raw OOXML
  injection or Pandoc's math pipeline.
- **Complex merged-cell tables** (rowspan / colspan) can't be produced by
  looping — you must pre-build the merge in the template and only
  substitute text. For variable-shape merged tables, only raw OOXML
  manipulation works.
- **LGPL license** — acceptable for a Python sidecar service we control,
  but means docxtpl can't be statically linked into a proprietary binary
  we redistribute. For a B2C SaaS invoked over HTTP this is fine.
- **No two-way editing** — template → docx only. Can't round-trip a
  user's uploaded .docx through docxtpl without losing Jinja tags.

## Recommendation

Use docxtpl **only as a fallback** for documents with heavy
merged-cell tables or complex layout that Pandoc mangles. Keep Pandoc
as the **primary assembler** (Markdown → docx) because:

- no template build/maintenance burden,
- deterministic output from plain-text source,
- better ecosystem for GOST styling via reference.docx.

Scenario routing (proposed for ADR-011):

| Scenario                                | Assembler |
|-----------------------------------------|-----------|
| Regular chapters, inline tables         | Pandoc    |
| Complex multi-header merged tables      | docxtpl   |
| Formulas-heavy (OMML)                   | raw OOXML |
| Client-supplied template .docx          | docxtpl   |

## Feeds into

- `docs/adr/ADR-011-pipeline-v6-assembler.md` — comparison matrix row
- pipeline-v6 Week 2 — decide whether to wire docxtpl as sidecar service
  or drop in favour of pure Pandoc + OOXML patcher.
