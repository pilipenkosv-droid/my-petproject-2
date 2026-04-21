import { describe, it, expect } from "vitest";
import { splitIntoSlots, rewriteBody } from "../../../src/lib/pipeline-v6/rewriter/body-rewriter";

describe("splitIntoSlots", () => {
  it("marks headings, lists, tables as frozen", () => {
    const md = [
      "# Введение",
      "",
      "Обычный абзац текста.",
      "",
      "- пункт списка",
      "- второй пункт",
      "",
      "| col1 | col2 |",
      "| --- | --- |",
      "| a | b |",
      "",
      "Ещё один абзац.",
    ].join("\n");

    const slots = splitIntoSlots(md);
    const kinds = slots.map((s) => `${s.kind}:${s.frozenReason ?? "body"}`);
    expect(kinds).toContain("frozen:heading");
    expect(kinds).toContain("frozen:list");
    expect(kinds).toContain("frozen:table");
    const bodies = slots.filter((s) => s.kind === "body");
    expect(bodies).toHaveLength(2);
    expect(bodies[0].text).toContain("Обычный абзац");
    expect(bodies[1].text).toContain("Ещё один абзац");
  });

  it("respects code fences", () => {
    const md = ["text before", "", "```", "code line", "```", "", "text after"].join("\n");
    const slots = splitIntoSlots(md);
    const frozenReasons = slots.filter((s) => s.kind === "frozen").map((s) => s.frozenReason);
    expect(frozenReasons).toContain("code-fence");
    expect(frozenReasons).toContain("code-block");
    expect(slots.filter((s) => s.kind === "body")).toHaveLength(2);
  });
});

describe("rewriteBody", () => {
  it("dry-run passes everything through unchanged", async () => {
    const md = "# Title\n\nParagraph one.\n\nParagraph two.\n";
    const result = await rewriteBody(md, { dryRun: true });
    expect(result.slotsRewritten).toBe(0);
    expect(result.markdown).toContain("# Title");
    expect(result.markdown).toContain("Paragraph one.");
    expect(result.markdown).toContain("Paragraph two.");
  });
});
