import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const roleEnum = z.enum(["admin", "pastor", "elder", "treasurer", "auditor", "member"]);

/**
 * Sign-up client used to create accounts WITHOUT the service-role key
 * (the app is deployed to Cloudflare where no admin key is available).
 * Sign-ups are auto-confirmed in the auth settings, and a database trigger
 * creates the matching profile row.
 */
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

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Only administrators can manage accounts");
}

/** Creates the auth user via sign-up, then finishes the profile + role as admin. */
async function provisionUser(
  context: { supabase: any; userId: string },
  input: {
    email: string;
    password: string;
    fullName: string;
    role: z.infer<typeof roleEnum>;
    churchId: string;
    memberId?: string | null;
    phone?: string | null;
  },
) {
  const auth = publicAuthClient();
  const { data: signed, error: signUpError } = await auth.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.fullName } },
  });
  if (signUpError) throw new Error(signUpError.message);
  const uid = signed.user?.id;
  if (!uid) throw new Error("An account with this email already exists");

  // The trigger created the profile row; complete it with the church + details.
  const { error: profileError } = await context.supabase
    .from("profiles")
    .update({
      full_name: input.fullName,
      email: input.email,
      phone: input.phone ?? null,
      primary_church_id: input.churchId,
      member_id: input.memberId ?? null,
      is_active: true,
      approval_status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: context.userId,
    })
    .eq("id", uid);
  if (profileError) throw new Error(profileError.message);

  await context.supabase.from("user_roles").delete().eq("user_id", uid);
  const { error: roleError } = await context.supabase
    .from("user_roles")
    .insert({ user_id: uid, role: input.role, church_id: input.churchId });
  if (roleError) throw new Error(roleError.message);

  return uid;
}

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  role: roleEnum,
  churchId: z.string().uuid(),
  memberId: z.string().uuid().nullable().optional(),
  phone: z.string().nullable().optional(),
});

export const createChurchUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const userId = await provisionUser(context, data);
    return { userId };
  });

export const listChurchUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ churchId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: roles, error } = await context.supabase
      .from("user_roles")
      .select("id,user_id,role")
      .eq("church_id", data.churchId);
    if (error) throw new Error(error.message);

    const ids = [...new Set((roles ?? []).map((r: any) => r.user_id as string))];
    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id,full_name,email")
      .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const byId = new Map((profiles ?? []).map((p: any) => [p.id as string, p]));

    return (roles ?? []).map((r: any) => ({
      id: r.id as string,
      userId: r.user_id as string,
      role: r.role as string,
      fullName: (byId.get(r.user_id) as any)?.full_name ?? "—",
      email: (byId.get(r.user_id) as any)?.email ?? "—",
    }));
  });

const bulkSchema = z.object({
  churchId: z.string().uuid(),
  defaultRole: roleEnum,
  invites: z
    .array(
      z.object({
        email: z.string().email(),
        fullName: z.string().min(2),
        role: roleEnum.optional(),
      }),
    )
    .min(1)
    .max(200),
});

function tempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/** Creates many accounts at once. Returns per-row status plus the temporary
 *  password so the administrator can hand credentials to each person. */
export const bulkInviteChurchUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => bulkSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const results: Array<{
      email: string;
      fullName: string;
      role: string;
      password?: string;
      ok: boolean;
      error?: string;
    }> = [];

    for (const invite of data.invites) {
      const role = invite.role ?? data.defaultRole;
      const password = tempPassword();
      try {
        await provisionUser(context, {
          email: invite.email,
          password,
          fullName: invite.fullName,
          role,
          churchId: data.churchId,
        });
        results.push({ email: invite.email, fullName: invite.fullName, role, password, ok: true });
      } catch (e) {
        results.push({
          email: invite.email,
          fullName: invite.fullName,
          role,
          ok: false,
          error: e instanceof Error ? e.message : "Failed",
        });
      }
    }

    return results;
  });
