import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const managedTables = [
  "receipts",
  "expenses",
  "cash_statements",
  "weekly_reports",
  "remittances",
  "church_members",
  "departments",
  "notices",
  "audit_log",
] as const;

export type ManagedTable = (typeof managedTables)[number];

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Administrator access required");
}

export const clearTableData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      table: z.enum(managedTables),
      churchId: z.string().uuid(),
      confirm: z.literal("DELETE"),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { data: deleted, error } = await context.supabase.rpc("clear_church_table_data", {
      p_table_name: data.table,
      p_church_id: data.churchId,
      p_confirm: data.confirm,
    });

    if (error) throw new Error(error.message);

    return { deleted: Number(deleted ?? 0) };
  });
