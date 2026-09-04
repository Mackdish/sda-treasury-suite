import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const roleEnum = z.enum(["admin", "pastor", "elder", "treasurer", "auditor", "member"]);

/**
 * All administration runs through the signed-in administrator's own session
 * (row level security allows administrators to manage every account), so the
 * service-role key is never needed — the app is deployed to Cloudflare.
 */
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Administrator access required");
}

function publicAuthClient() {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

async function writeAudit(
  supabase: any,
  userId: string,
  action: string,
  entity: string,
  entityId: string | null,
  details: Record<string, unknown>,
) {
  await supabase.from("audit_log").insert({
    user_id: userId,
    action,
    entity,
    entity_id: entityId,
    details,
  });
}

/**
 * Called right after sign-in / sign-up. A database trigger creates the profile
 * for new sign-ups; this self-heals older accounts and bootstraps the very
 * first account as an approved administrator.
 */
export const ensureProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ fullName: z.string().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("ensure_my_profile");
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;

    if (data.fullName?.trim()) {
      await context.supabase
        .from("profiles")
        .update({ full_name: data.fullName.trim() })
        .eq("id", context.userId);
    }

    return {
      created: true,
      approvalStatus: (row?.approval_status as string) ?? "pending",
      isActive: row?.is_active ?? true,
    };
  });

/** Current user's own account status — used by the access gate. */
export const myAccountStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("approval_status, is_active, rejection_reason, full_name")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      exists: !!data,
      approvalStatus: (data?.approval_status as string) ?? "pending",
      isActive: data?.is_active ?? true,
      rejectionReason: (data?.rejection_reason as string | null) ?? null,
    };
  });

export type ManagedUser = {
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  roles: string[];
  approvalStatus: string;
  isActive: boolean;
  churchId: string | null;
  memberId: string | null;
  createdAt: string | null;
};

export const listManagedUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManagedUser[]> => {
    await assertAdmin(context);

    const [{ data: profiles, error }, { data: roles }] = await Promise.all([
      context.supabase
        .from("profiles")
        .select(
          "id, full_name, email, phone, is_active, approval_status, primary_church_id, member_id, created_at",
        )
        .order("created_at", { ascending: false }),
      context.supabase.from("user_roles").select("user_id, role"),
    ]);
    if (error) throw new Error(error.message);

    const rolesByUser = new Map<string, string[]>();
    for (const r of (roles ?? []) as any[]) {
      rolesByUser.set(r.user_id, [...(rolesByUser.get(r.user_id) ?? []), r.role as string]);
    }

    return ((profiles ?? []) as any[]).map((p) => ({
      userId: p.id,
      email: p.email ?? "—",
      fullName: p.full_name ?? "—",
      phone: p.phone,
      roles: rolesByUser.get(p.id) ?? [],
      approvalStatus: p.approval_status as string,
      isActive: p.is_active,
      churchId: p.primary_church_id,
      memberId: p.member_id,
      createdAt: p.created_at,
    }));
  });

export const setUserApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "pending"]),
        reason: z.string().max(500).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("profiles")
      .update({
        approval_status: data.decision,
        approved_at: data.decision === "approved" ? new Date().toISOString() : null,
        approved_by: context.userId,
        rejection_reason: data.decision === "rejected" ? (data.reason ?? null) : null,
      })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    await writeAudit(
      context.supabase,
      context.userId,
      `user_${data.decision}`,
      "profiles",
      data.userId,
      { reason: data.reason ?? null },
    );
    return { ok: true };
  });

export const updateManagedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        fullName: z.string().min(2).optional(),
        phone: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
        role: roleEnum.optional(),
        churchId: z.string().uuid().nullable().optional(),
        /** Sends a password-reset email instead of setting a password directly. */
        sendPasswordReset: z.boolean().optional(),
        redirectTo: z.string().url().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    if (data.userId === context.userId && data.isActive === false) {
      throw new Error("You cannot deactivate your own account");
    }

    const patch: {
      full_name?: string;
      phone?: string | null;
      is_active?: boolean;
      primary_church_id?: string | null;
    } = {};
    if (data.fullName !== undefined) patch.full_name = data.fullName;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    if (data.churchId !== undefined) patch.primary_church_id = data.churchId;
    if (Object.keys(patch).length) {
      const { error } = await context.supabase.from("profiles").update(patch).eq("id", data.userId);
      if (error) throw new Error(error.message);
    }

    if (data.role) {
      if (data.userId === context.userId && data.role !== "admin") {
        throw new Error("You cannot remove your own administrator role");
      }
      const { data: profile } = await context.supabase
        .from("profiles")
        .select("primary_church_id")
        .eq("id", data.userId)
        .maybeSingle();
      await context.supabase.from("user_roles").delete().eq("user_id", data.userId);
      const { error } = await context.supabase.from("user_roles").insert({
        user_id: data.userId,
        role: data.role,
        church_id: data.churchId ?? profile?.primary_church_id ?? null,
      });
      if (error) throw new Error(error.message);
    }

    let passwordResetSent = false;
    if (data.sendPasswordReset) {
      const { data: profile } = await context.supabase
        .from("profiles")
        .select("email")
        .eq("id", data.userId)
        .maybeSingle();
      const email = (profile as any)?.email as string | undefined;
      if (!email) throw new Error("No email address on file for this account");
      const auth = publicAuthClient();
      const { error } = await auth.auth.resetPasswordForEmail(
        email,
        data.redirectTo ? { redirectTo: data.redirectTo } : undefined,
      );
      if (error) throw new Error(error.message);
      passwordResetSent = true;
    }

    await writeAudit(context.supabase, context.userId, "user_updated", "profiles", data.userId, {
      fields: Object.keys(data).filter((k) => k !== "userId"),
      passwordResetSent,
    });
    return { ok: true, passwordResetSent };
  });

export const deleteManagedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("You cannot delete your own account");

    await writeAudit(context.supabase, context.userId, "user_deleted", "profiles", data.userId, {});
    await context.supabase.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await context.supabase.from("profiles").delete().eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Tables an administrator may inspect and clear from the panel. */
const MANAGED_TABLES = [
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
export type ManagedTable = (typeof MANAGED_TABLES)[number];

export const databaseOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const counts = await Promise.all(
      MANAGED_TABLES.map(async (table) => {
        const { count } = await context.supabase
          .from(table)
          .select("id", { count: "exact", head: true });
        return { table, count: count ?? 0 };
      }),
    );
    return counts;
  });

/** Destructive: deletes every row of one table for one church. Audited. */
export const clearTableData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        table: z.enum(MANAGED_TABLES),
        churchId: z.string().uuid(),
        confirm: z.literal("DELETE"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { data: backup } = await context.supabase
      .from(data.table)
      .select("*")
      .eq("church_id", data.churchId);

    await writeAudit(context.supabase, context.userId, "table_cleared", data.table, null, {
      churchId: data.churchId,
      rows: backup?.length ?? 0,
      snapshot: backup ?? [],
    });

    const { error } = await context.supabase
      .from(data.table)
      .delete()
      .eq("church_id", data.churchId);
    if (error) throw new Error(error.message);
    return { deleted: backup?.length ?? 0 };
  });
