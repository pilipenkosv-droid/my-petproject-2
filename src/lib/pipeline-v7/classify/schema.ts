/**
 * Output contract of the LLM residue layer.
 *
 * The model never returns text — only an index into the batch it was handed,
 * a role and a confidence. Anything it invents beyond that (echoed text,
 * rationales, extra keys) is dropped by the parse, so a chatty model cannot
 * widen the blast radius of a bad answer.
 */

import { z } from "zod";

/**
 * Deliberately narrower than `Role`: table cells, formulas, notes, headers and
 * empty paragraphs are decided by position or markup, never by reading text,
 * so the model is not offered them.
 */
export const roleEnum = z.enum([
  "heading_L1",
  "heading_L2",
  "heading_L3",
  "body",
  "list_item",
  "figure_caption",
  "table_caption",
  "bibliography_item",
  "appendix_heading",
  "title_page",
  "toc",
  "unknown",
]);

export type LlmRole = z.infer<typeof roleEnum>;

export const roleAssignmentSchema = z.object({
  /** Index within the batch, as printed in the prompt. */
  i: z.number().int().min(0),
  role: roleEnum,
  confidence: z.number().min(0).max(1),
});

export const roleBatchSchema = z.object({
  assignments: z.array(roleAssignmentSchema),
});

export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;
export type RoleBatch = z.infer<typeof roleBatchSchema>;
