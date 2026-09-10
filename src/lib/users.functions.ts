import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const roleEnum = z.enum(["admin", "pastor", "elder", "treasurer", "auditor", "member"]);

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !isAdmin) throw new Error("Administrator access required");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function sha256Hex(value: string) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)).then((buffer) =>
    Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join(""),
  );
}

const invitationSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2).max(150),
  role: roleEnum,
  churchId: z.string().uuid(),
  memberId: z.string().uuid().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
});

export type UserInvitation = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  churchId: string;
  memberId: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

/**
 * Creates an invitation only. No Supabase service-role key and no password
 * is ever handled by the administrator or this server function.
 */
export const createUserInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => invitationSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invitation, error } = await context.supabase
      .from("user_invitations")
      .insert({
        church_id: data.churchId,
        email: data.email.trim().toLowerCase(),
        full_name: data.fullName.trim(),
        phone: data.phone?.trim() || null,
        role: data.role,
        member_id: data.memberId ?? null,
        token_hash: tokenHash,
        invited_by: context.userId,
        expires_at: expiresAt,
      })
      .select("id,email,full_name,role,church_id,member_id,expires_at,accepted_at,revoked_at,created_at")
      .single();

    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      church_id: data.churchId,
      user_id: context.userId,
      action: "user_invited",
      entity: "user_invitations",
      entity_id: invitation.id,
      details: { email: data.email.trim().toLowerCase(), role: data.role, expires_at: expiresAt },
    });

    return {
      invitation: invitation as UserInvitation,
      token,
      invitationUrl: `/auth?invite=${encodeURIComponent(token)}`,
    };
  });

export const listUserInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ churchId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("user_invitations")
      .select("id,email,full_name,role,church_id,member_id,expires_at,accepted_at,revoked_at,created_at")
      .eq("church_id", data.churchId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []) as UserInvitation[];
  });

export const revokeUserInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ invitationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("user_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.invitationId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .select("church_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Invitation is already accepted, revoked, or unavailable");

    await context.supabase.from("audit_log").insert({
      church_id: row.church_id,
      user_id: context.userId,
      action: "user_invitation_revoked",
      entity: "user_invitations",
      entity_id: data.invitationId,
      details: {},
    });
    return { ok: true };
  });

export const completeUserInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ token: z.string().min(32).max(128) }).parse(data))
  .handler(async ({ data, context }) => {
    const tokenHash = await sha256Hex(data.token);
    const { data: result, error } = await context.supabase.rpc("complete_user_invitation", {
      p_token_hash: tokenHash,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : result;
    return row;
  });

export const createChurchUser = createUserInvitation;
export const listChurchUsers = listUserInvitations;

const bulkSchema = z.object({
  churchId: z.string().uuid(),
  defaultRole: roleEnum,
  invites: z.array(z.object({ email: z.string().email(), fullName: z.string().min(2), role: roleEnum.optional() })).min(1).max(200),
});

export const bulkInviteChurchUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => bulkSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const results: Array<{ email: string; fullName: string; role: string; invitationUrl?: string; expiresAt?: string; ok: boolean; error?: string }> = [];

    for (const invite of data.invites) {
      try {
        const token = randomToken();
        const tokenHash = await sha256Hex(token);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const role = invite.role ?? data.defaultRole;
        const { data: row, error } = await context.supabase
          .from("user_invitations")
          .insert({
            church_id: data.churchId,
            email: invite.email.trim().toLowerCase(),
            full_name: invite.fullName.trim(),
            role,
            token_hash: tokenHash,
            invited_by: context.userId,
            expires_at: expiresAt,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        await context.supabase.from("audit_log").insert({
          church_id: data.churchId,
          user_id: context.userId,
          action: "user_invited",
          entity: "user_invitations",
          entity_id: row.id,
          details: { email: invite.email.trim().toLowerCase(), role, expires_at: expiresAt },
        });
        results.push({ email: invite.email, fullName: invite.fullName, role, invitationUrl: `/auth?invite=${encodeURIComponent(token)}`, expiresAt, ok: true });
      } catch (e) {
        results.push({ email: invite.email, fullName: invite.fullName, role: invite.role ?? data.defaultRole, ok: false, error: e instanceof Error ? e.message : "Failed" });
      }
    }
    return results;
  });
