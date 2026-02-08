/**
 * Типы для интеграции с LanguageTool API
 * и проверки грамматики
 */

// ── LanguageTool API Response ──────────────────────────

export interface LTMatch {
  message: string;
  shortMessage: string;
  offset: number;
  length: number;
  replacements: { value: string }[];
  rule: {
    id: string;
    description: string;
    issueType: string;
    category: {
      id: string;
      name: string;
    };
  };
  context: {
    text: string;
    offset: number;
    length: number;
  };
}

export interface LTResponse {
  matches: LTMatch[];
  language: {
    name: string;
    code: string;
    detectedLanguage?: {
      name: string;
      code: string;
      confidence: number;
    };
  };
}

// ── App-level types ────────────────────────────────────

export type GrammarCategory =
  | "SPELLING"
  | "GRAMMAR"
  | "PUNCTUATION"
  | "STYLE"
  | "TYPOS"
  | "CASING"
  | "CONFUSED_WORDS"
  | "OTHER";

export interface GrammarError {
  id: string;
  message: string;
  shortMessage: string;
  offset: number;
  length: number;
  replacements: string[];
  category: GrammarCategory;
  categoryName: string;
  ruleId: string;
}

export interface GrammarCheckResult {
  errors: GrammarError[];
  stats: {
    total: number;
    byCategory: Record<string, number>;
  };
}
