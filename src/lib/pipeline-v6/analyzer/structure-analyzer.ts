// Structure Analyzer — Stage 0, confidence-gated.
// Decides how much LLM help the document needs for structural detection.
//
// Output routes:
//   - "preserve": document already has explicit heading styles → pass markdown through
//   - "heuristic": partial structure → use regex-based section detection + user confirm
//   - "llm-full": plain-text dump → LLM must infer chapters/sections
//
// Also detects structural sections (Введение, Заключение, Список литературы)
// so Assembler can put them on correct pages.

import type { ExtractedDocument } from "../extractor/mammoth-extractor";

export type StructureRoute = "preserve" | "heuristic" | "llm-full";

export interface DetectedSection {
  type:
    | "abstract"
    | "toc"
    | "introduction"
    | "chapter"
    | "conclusion"
    | "bibliography"
    | "appendix"
    | "unknown";
  title: string;
  /** Line index in extracted markdown. */
  startLine: number;
  /** Heading level 1-3 if detected. */
  level: number | null;
}

export interface StructureReport {
  route: StructureRoute;
  confidence: number; // 0..1
  sections: DetectedSection[];
  needsLLM: boolean;
  reasoning: string[];
}

const STRUCTURAL_MARKERS: { type: DetectedSection["type"]; patterns: RegExp[] }[] = [
  {
    type: "abstract",
    patterns: [/^\s*(реферат|аннотация|abstract)\s*$/i],
  },
  {
    type: "toc",
    patterns: [/^\s*(содержание|оглавление)\s*$/i],
  },
  {
    type: "introduction",
    patterns: [/^\s*введение\s*$/i],
  },
  {
    type: "conclusion",
    patterns: [/^\s*(заключение|выводы(?:\s+по\s+работе)?)\s*$/i],
  },
  {
    type: "bibliography",
    patterns: [
      /^\s*список\s+(использованн[ыо][йх]\s+)?(литературы|источник(ов|и))\s*$/i,
      /^\s*библиограф(ический\s+список|ия)\s*$/i,
    ],
  },
  {
    type: "appendix",
    patterns: [/^\s*приложени[ея]\s*[абвгдеё\d]?\s*$/i],
  },
];

function detectSectionType(cleanTitle: string): DetectedSection["type"] {
  for (const { type, patterns } of STRUCTURAL_MARKERS) {
    if (patterns.some((p) => p.test(cleanTitle))) return type;
  }
  if (/^\s*глава\s+\d+/i.test(cleanTitle) || /^\s*\d+\s+[а-яa-z]/i.test(cleanTitle)) {
    return "chapter";
  }
  return "unknown";
}

export function analyzeStructure(doc: ExtractedDocument): StructureReport {
  const lines = doc.markdown.split("\n");
  const sections: DetectedSection[] = [];
  const reasoning: string[] = [];

  // Pass 1: markdown headings (# / ## / ###)
  lines.forEach((line, idx) => {
    const headingMatch = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (headingMatch) {
      const title = headingMatch[2].trim();
      sections.push({
        type: detectSectionType(title),
        title,
        startLine: idx,
        level: headingMatch[1].length,
      });
    }
  });

  // Pass 2: structural markers on plain paragraph lines (when no markdown headings)
  if (sections.length === 0) {
    lines.forEach((line, idx) => {
      const t = line.trim();
      if (t.length === 0 || t.length > 80) return;
      const type = detectSectionType(t);
      if (type !== "unknown") {
        sections.push({ type, title: t, startLine: idx, level: null });
      }
    });
  }

  const h1 = doc.statistics.h1Count;
  const h2 = doc.statistics.h2Count;
  const hasStructuralMarkers = sections.some(
    (s) => s.type !== "unknown" && s.type !== "chapter",
  );

  let confidence: number;
  let route: StructureRoute;

  if (h1 >= 3 && hasStructuralMarkers) {
    confidence = 0.95;
    route = "preserve";
    reasoning.push(`h1=${h1} and structural markers present → preserve as-is`);
  } else if (h1 >= 1 || hasStructuralMarkers) {
    confidence = 0.6;
    route = "heuristic";
    reasoning.push(`h1=${h1}, structural markers=${hasStructuralMarkers} → heuristic route`);
  } else {
    confidence = 0.25;
    route = "llm-full";
    reasoning.push("no headings, no structural markers → LLM must infer structure");
  }

  if (h2 === 0 && route === "preserve") {
    reasoning.push("no h2 subheadings — downgrade to heuristic");
    route = "heuristic";
    confidence = Math.min(confidence, 0.65);
  }

  return {
    route,
    confidence,
    sections,
    needsLLM: route !== "preserve",
    reasoning,
  };
}
