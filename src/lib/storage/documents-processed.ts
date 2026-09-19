import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Обработано документов за всю историю = архив (site_stats, пополняется cleanup
 * перед удалением jobs старше 30 дней) + текущие completed в jobs без теневых копий.
 */
export async function countDocumentsProcessed(): Promise<number> {
  const admin = getSupabaseAdmin();

  const [{ count, error: countError }, { data: archived, error: archivedError }] = await Promise.all([
    admin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .is("shadow_of", null),
    admin
      .from("site_stats")
      .select("value")
      .eq("key", "documents_processed_archived")
      .maybeSingle(),
  ]);

  if (countError) throw countError;
  if (archivedError) throw archivedError;

  return (archived?.value ?? 0) + (count ?? 0);
}
