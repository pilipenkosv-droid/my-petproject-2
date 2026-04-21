// Rule pack registry. Фаза 1 — только in-memory seed. Фаза 2 — таблица
// formatting_templates в Supabase и resolver с кешем.

import type { RulePack } from "./types";
import { GOST_7_32 } from "./gost-7-32";

export * from "./types";
export { GOST_7_32 };

const PACKS: Record<string, RulePack> = {
  [GOST_7_32.slug]: GOST_7_32,
};

export const DEFAULT_RULE_PACK_SLUG = GOST_7_32.slug;

export function resolveRulePack(slug: string = DEFAULT_RULE_PACK_SLUG): RulePack {
  const pack = PACKS[slug];
  if (!pack) throw new Error(`Unknown rule pack slug: ${slug}`);
  return pack;
}

export function listRulePacks(): RulePack[] {
  return Object.values(PACKS);
}
