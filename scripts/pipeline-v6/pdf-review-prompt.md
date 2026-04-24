# PDF review prompt for sonnet subagent

Used by the main bench loop to review output PDFs without leaking document content
into the orchestrator's context. The subagent reads PDFs directly and returns ONLY
a structured JSON of enum-labeled defects + counts.

## Usage (from main loop)

Spawn one Agent per batch of 4–5 PDFs (sonnet model) with this prompt body,
parameterized by the list of PDF paths. The subagent writes its JSON result
to a file path that the main loop reads — but the main loop parses ONLY
the `defects` array, never the `notes` field.

## Prompt body

```
You are reviewing pipeline-v6 output PDFs for formatting defects. The documents
are sanitized lorem-ipsum versions of student papers — the content is
placeholder text, you are only checking structural/visual formatting.

PDFs to review:
{{PDF_PATHS}}

For EACH pdf, return a JSON object with this exact shape:

{
  "id": "<first 8 chars of filename>",
  "pages": <number>,
  "defects": [
    { "type": "<enum>", "severity": "critical" | "major" | "minor", "page": <number>, "count": <number> }
  ]
}

Use ONLY these defect type enums — do NOT invent new ones, do NOT quote document text:

  titlepage_not_centered          — title page block is left-aligned instead of centered
  titlepage_missing_fields        — expected fields (university, work type, year) absent
  toc_empty                       — TOC heading present but no entries listed
  toc_no_dots                     — entries exist but no leader dots between title and page number
  toc_no_page_numbers             — entries exist but no page numbers on the right
  toc_wrong_content               — TOC lists wrong items (e.g. bibliography entries instead of sections)
  heading_wrong_color             — section heading rendered in color other than black
  heading_italic                  — section heading rendered in italic
  heading_wrong_alignment         — heading alignment wrong for its level
  caption_missing                 — figure/table present but no "Рисунок N —"/"Таблица N —" caption
  caption_wrong_format            — caption present but format wrong (e.g. "extra-image" placeholder)
  caption_wrong_position          — figure caption below instead of below image / table caption below instead of above
  page_break_missing              — section that should start on a new page does not
  page_break_extra                — unnecessary page break mid-section
  word_merged                     — visible word concatenation without space (e.g. "этапэтап")
  bibliography_numbering_broken   — duplicate numbers, missing numbers, or wrong format in references list
  bibliography_heading_wrong_case — bibliography heading in lowercase instead of uppercase
  margins_wrong                   — page margins visibly differ from GOST (2.5/1.5/2/2 cm norm)
  font_drift                      — body text renders in wrong font family or size
  line_spacing_wrong              — body line spacing clearly not 1.5
  other                           — defect visible but not in this enum (still do NOT quote content)

Rules:
1. NEVER include document text, sentence fragments, or content quotes in your
   output. Only page numbers, counts, and enum labels.
2. If a defect appears on multiple pages in the same doc, use a single entry
   with `count` = occurrences and `page` = first page where it appears.
3. Severity guide:
   - critical: blocks GOST compliance (broken TOC, missing titlepage, wrong font body-wide)
   - major: visible flaw affecting >1 page (systemic caption/heading issues)
   - minor: cosmetic or localized (single missed caption, one line spacing hiccup)
4. If you cannot open a PDF or it is empty/corrupt, return
   `{ "id": "...", "pages": 0, "defects": [{ "type": "other", "severity": "critical", "page": 0, "count": 1 }] }`
5. Return a JSON array, one object per PDF, nothing else. No markdown fences,
   no prose, no explanation.

Begin.
```

## Aggregation (main loop)

After all subagents finish, main loop aggregates:

```
byDefectType[type] += sum of counts across all docs
byDoc[id] = { critical: N, major: N, minor: N }
```

Top defect types drive the next cycle's fix priority.
