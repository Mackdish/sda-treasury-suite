import { supabase } from "@/integrations/supabase/client";

/**
 * Value written to `approval_status` when a receipt cannot be hard-deleted.
 * Every receipts query in the app filters this status out, so an archived
 * receipt disappears from the UI, totals, statements and reports.
 */
export const DELETED_STATUS = "deleted";

export type DeleteOutcome = "deleted" | "archived";

/**
 * Deletes a receipt or expense using only the signed-in user's session — no
 * migration, RPC or service-role key.
 *
 * Supabase does NOT raise an error when row level security blocks a DELETE; it
 * just removes 0 rows. The old code only checked `error`, so it reported
 * success while the receipt stayed in the database and came back on refresh.
 * We now ask for the deleted rows back and check that something was removed.
 *
 * 1. Try a real DELETE.
 * 2. Receipts only: if that removed nothing (blocked by RLS) or failed, fall
 *    back to archiving the row via UPDATE (which the app already uses for
 *    editing/approving). Archived rows are hidden everywhere.
 */
export async function deleteRecord(table: "receipts" | "expenses", id: string): Promise<DeleteOutcome> {
  const { data: removed, error: deleteError } = await (supabase.from(table) as any)
    .delete()
    .eq("id", id)
    .select("id");

  if (!deleteError && removed?.length) return "deleted";

  if (table !== "receipts") {
    if (deleteError) throw new Error(deleteError.message);
    throw new Error("The database refused to delete this expense (no permission). Nothing was removed.");
  }

  const { data: archived, error: archiveError } = await (supabase.from("receipts") as any)
    .update({ approval_status: DELETED_STATUS })
    .eq("id", id)
    .select("id");

  if (archiveError) throw new Error(archiveError.message);
  if (!archived?.length) {
    throw new Error("You don't have permission to delete this receipt, or it no longer exists.");
  }
  return "archived";
}

const LEGACY_HIDDEN_KEY = "sda-treasury-hidden-receipts";
let legacyPurgeStarted = false;

/**
 * Earlier versions "deleted" receipts by hiding their ids in this browser's
 * localStorage only; the rows were never removed from the database. Delete
 * those for real once, then clear the local list. Failures stay in the list
 * and are retried next session.
 */
export async function purgeLegacyHiddenReceipts(): Promise<number> {
  if (legacyPurgeStarted || typeof localStorage === "undefined") return 0;
  legacyPurgeStarted = true;

  let ids: string[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_HIDDEN_KEY) ?? "[]");
    ids = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return 0;
  }
  if (!ids.length) return 0;

  const remaining: string[] = [];
  let done = 0;
  for (const id of ids) {
    try {
      await deleteRecord("receipts", id);
      done++;
    } catch {
      remaining.push(id);
    }
  }

  try {
    if (remaining.length) localStorage.setItem(LEGACY_HIDDEN_KEY, JSON.stringify(remaining));
    else localStorage.removeItem(LEGACY_HIDDEN_KEY);
  } catch {
    /* ignore */
  }
  return done;
}
