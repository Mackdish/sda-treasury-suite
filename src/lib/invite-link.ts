/**
 * Invitations without a database table.
 *
 * An invitation is a sign-up link that pre-fills the person's details. When
 * they create their account they appear under "Pending approvals", where an
 * administrator approves them and assigns the role. Nothing here needs a
 * migration, a service-role key, or any table beyond the ones the app already
 * uses.
 *
 * The role chosen at invite time is remembered in this browser only, purely as
 * a convenience: it pre-selects the role in the approval dropdown. It is never
 * trusted — the administrator always sees and confirms the role on approval.
 */

export type InviteRole = "admin" | "pastor" | "elder" | "treasurer" | "auditor" | "member";
export const INVITE_ROLES: InviteRole[] = ["admin", "pastor", "elder", "treasurer", "auditor", "member"];

const STORAGE_KEY = "sda-treasurer:invited-roles";

const normEmail = (email: string) => email.trim().toLowerCase();

export function buildInviteLink(
  origin: string,
  p: { fullName: string; email: string; phone?: string | null },
): string {
  const params = new URLSearchParams({ invited: "1", name: p.fullName.trim(), email: normEmail(p.email) });
  if (p.phone?.trim()) params.set("phone", p.phone.trim());
  return `${origin}/auth?${params.toString()}`;
}

function readMap(): Record<string, InviteRole> {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Remember which role was chosen for this email (best effort, this browser only). */
export function rememberInvitedRole(email: string, role: InviteRole) {
  try {
    const map = readMap();
    map[normEmail(email)] = role;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable — the dropdown simply defaults to "member" */
  }
}

/** The role chosen when this email was invited from this browser, if any. */
export function invitedRoleFor(email: string | null | undefined): InviteRole | null {
  if (!email) return null;
  const role = readMap()[normEmail(email)];
  return role && INVITE_ROLES.includes(role) ? role : null;
}

/** Kenyan-friendly number for wa.me links: 0712… → 254712…, strips spaces and +. */
export function whatsappNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
}

export function inviteMessage(churchName: string | undefined, fullName: string, link: string) {
  const church = churchName ? ` at ${churchName}` : "";
  return `Hello ${fullName}, you have been invited to the SDA Treasurer system${church}. Create your account here: ${link}\nAn administrator will approve your access after you sign up.`;
}
