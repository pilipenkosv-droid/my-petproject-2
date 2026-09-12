/**
 * Text and field-instruction normalisation.
 *
 * `normalizeText` is the strict form that goes into the fingerprint;
 * `looseEqual` is the wider equivalence the gate may accept under A4.
 */

const NBSP = / /g;

/**
 * NFC, NBSP → space, space and newline runs collapsed, trimmed.
 *
 * A tab stays a tab: `w:tab` is how a static table of contents holds its leader
 * column apart, so collapsing it into a space would make "1 Введение 5" and
 * "1 Введение\t5" the same paragraph and hide a real content change. Only
 * spaces — every whitespace that is neither a tab nor a newline — collapse.
 */
export function normalizeText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(NBSP, " ")
    .replace(/[^\S\n\t]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
}

/** A4 equivalence: quote shapes and digit-range dashes are considered equal. */
export function looseForm(s: string): string {
  return normalizeText(s)
    .replace(/[«»“”„‟"]/g, '"')
    .replace(/(?<=\d)[-–—](?=\d)/g, "-");
}

export function looseEqual(a: string, b: string): boolean {
  return looseForm(a) === looseForm(b);
}

/** Field keywords whose arguments are content and must survive verbatim. */
export const ARG_PRESERVING = new Set(["REF", "PAGEREF", "SEQ", "NOTEREF", "STYLEREF", "HYPERLINK"]);

/** Field keywords whose arguments are presentation and may change freely. */
export const ARG_STRIPPED = new Set(["PAGE", "NUMPAGES", "TOC", "DATE", "TIME", "SECTIONPAGES"]);

/** Uppercased, whitespace-collapsed; arguments dropped for presentation fields. */
export function normalizeInstr(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim().toUpperCase();
  if (!s) return "";
  const keyword = s.split(" ")[0];
  return ARG_STRIPPED.has(keyword) ? keyword : s;
}

export function instrKeyword(normalized: string): string {
  return normalized.split(" ")[0] ?? "";
}

/**
 * Bookmark a REF-family instruction points at, or undefined.
 * Switches (\h, \p …) are skipped; the first plain argument is the name.
 */
export function instrBookmark(normalized: string): string | undefined {
  const parts = normalized.split(" ");
  const keyword = parts[0];
  if (keyword !== "REF" && keyword !== "PAGEREF" && keyword !== "NOTEREF") return undefined;
  for (const raw of parts.slice(1)) {
    if (raw.startsWith("\\")) continue;
    const name = raw.replace(/^["']|["']$/g, "");
    if (name) return name;
  }
  return undefined;
}

/** `_dpx_aux_<kind>_<n>` marker bookmarks inserted by v7 itself. */
export const AUX_BOOKMARK = /^_dpx_aux_(toc|caption)_(\d+)$/;

export function auxKind(name: string): "toc" | "caption" | undefined {
  const m = AUX_BOOKMARK.exec(name);
  return m ? (m[1] as "toc" | "caption") : undefined;
}
