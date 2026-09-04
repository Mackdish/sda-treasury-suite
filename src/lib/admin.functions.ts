import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const roleEnum = z.enum(["admin", "pastor", "elder", "treasurer", "auditor", "member"]);

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Administrator access required");
}

/**
 * Called right after sign-in / sign-up. Creates the missing profile row
 * (the database has no auth trigger, so profiles must be created here) and
 * bootstraps the very first account as an approved administrator.
 */
export const ensureProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ fullName: z.string().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id, approval_status, is_active")
      .eq("id", uid)
      .maybeSingle();

    if (existing) {
      return {
        created: false,
        approvalStatus: existing.approval_status as string,
        isActive: existing.is_active,
      };
    }

    // Is this the first ever account? Then it becomes the administrator.
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true });
    const isFirst = (count ?? 0) === 0;

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(uid);
    const metaName =
      (authUser?.user?.user_metadata as Record<string, unknown> | undefined)?.["full_name"];
    const fullName =
      data.fullName?.trim() ||
      (typeof metaName === "string" ? metaName : "") ||
      authUser?.user?.email ||
      "New user";

    let churchId: string | null = null;
    if (isFirst) {
      const { data: church } = await supabaseAdmin
        .from("churches")
        .select("id")
        .limit(1)
        .maybeSingle();
      if (church) {
        churchId = church.id;
      } else {
        const { data: created, error } = await supabaseAdmin
          .from("churches")
          .insert({ name: "My Church", currency: "KES" })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        churchId = created.id;
      }
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: uid,
      full_name: fullName,
      is_active: true,
      primary_church_id: churchId,
      approval_status: isFirst ? "approved" : "pending",
      approved_at: isFirst ? new Date().toISOString() : null,
    });
    if (profileError) throw new Error(profileError.message);

    if (isFirst) {
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: uid, role: "admin", church_id: churchId });
      if (roleError) throw new Error(roleError.message);
    }

    return {
      created: true,
      approvalStatus: isFirst ? "approved" : "pending",
      isActive: true,
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, full_name, phone, is_active, approval_status, primary_church_id, member_id, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const rolesByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      rolesByUser.set(r.user_id, [...(rolesByUser.get(r.user_id) ?? []), r.role as string]);
    }

    const listed = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const emailById = new Map((listed.data?.users ?? []).map((u) => [u.id, u.email ?? ""]));

    return (profiles ?? []).map((p) => ({
      userId: p.id,
      email: emailById.get(p.id) ?? "—",
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

async function writeAudit(
  supabaseAdmin: any,
  userId: string,
  action: string,
  entity: string,
  entityId: string | null,
  details: Record<string, unknown>,
) {
  await supabaseAdmin.from("audit_log").insert({
    user_id: userId,
    action,
    entity,
    entity_id: entityId,
    details,
  });
}

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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        approval_status: data.decision,
        approved_at: data.decision === "approved" ? new Date().toISOString() : null,
        approved_by: context.userId,
        rejection_reason: data.decision === "rejected" ? (data.reason ?? null) : null,
      })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, context.userId, `user_${data.decision}`, "profiles", data.userId, {
      reason: data.reason ?? null,
    });
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
        password: z.string().min(8).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.userId === context.userId && data.isActive === false) {
      throw new Error("You cannot deactivate your own account");
    }

    const patch: Record<string, unknown> = {};
    if (data.fullName !== undefined) patch["full_name"] = data.fullName;
    if (data.phone !== undefined) patch["phone"] = data.phone;
    if (data.isActive !== undefined) patch["is_active"] = data.isActive;
    if (data.churchId !== undefined) patch["primary_church_id"] = data.churchId;
    if (Object.keys(patch).length) {
      const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.userId);
      if (error) throw new Error(error.message);
    }

    if (data.role) {
      if (data.userId === context.userId && data.role !== "admin") {
        throw new Error("You cannot remove your own administrator role");
      }
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("primary_church_id")
        .eq("id", data.userId)
        .maybeSingle();
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
      const { error } = await supabaseAdmin.from("user_roles").insert({
        user_id: data.userId,
        role: data.role,
        church_id: data.churchId ?? profile?.primary_church_id ?? null,
      });
      if (error) throw new Error(error.message);
    }

    if (data.password) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        password: data.password,
      });
      if (error) throw new Error(error.message);
    }

    await writeAudit(supabaseAdmin, context.userId, "user_updated", "profiles", data.userId, {
      fields: Object.keys(data).filter((k) => k !== "userId" && k !== "password"),
      passwordReset: !!data.password,
    });
    return { ok: true };
  });

export const deleteManagedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("You cannot delete your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await writeAudit(supabaseAdmin, context.userId, "user_deleted", "profiles", data.userId, {});
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows: Array<{ table: string; count: number }> = [];
    for (const table of MANAGED_TABLES) {
      const { count } = await supabaseAdmin
        .from(table)
        .select("id", { count: "exact", head: true });
      rows.push({ table, count: count ?? 0 });
    }
    return rows;
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: backup } = await supabaseAdmin
      .from(data.table)
      .select("*")
      .eq("church_id", data.churchId);

    await writeAudit(
      supabaseAdmin,
      context.userId,
      "table_cleared",
      data.table,
      null,
      { churchId: data.churchId, rows: backup?.length ?? 0, snapshot: backup ?? [] },
    );

    const { error } = await supabaseAdmin
      .from(data.table)
      .delete()
      .eq("church_id", data.churchId);
    if (error) throw new Error(error.message);
    return { deleted: backup?.length ?? 0 };
  });
