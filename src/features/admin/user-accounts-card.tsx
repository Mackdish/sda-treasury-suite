import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Role = "admin" | "pastor" | "elder" | "treasurer" | "auditor" | "member";
const ROLES: Role[] = ["admin", "pastor", "elder", "treasurer", "auditor", "member"];

type InvitationRow = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  church_id: string;
  member_id: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "Unknown error");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function loadInvitations(churchId: string): Promise<InvitationRow[]> {
  const { data, error } = await (supabase as any)
    .from("user_invitations")
    .select("id,email,full_name,role,church_id,member_id,expires_at,accepted_at,revoked_at,created_at")
    .eq("church_id", churchId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as InvitationRow[];
}

export function UserAccountsCard({ churchId }: { churchId: string }) {
  const qc = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("treasurer");
  const [invitationUrl, setInvitationUrl] = useState("");

  const invitationsQuery = useQuery({
    queryKey: ["church-invitations", churchId],
    queryFn: () => loadInvitations(churchId),
  });

  const addUser = useMutation({
    mutationFn: async () => {
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = fullName.trim();
      const cleanPhone = phone.trim() || null;

      if (!cleanName || cleanName.length < 2) throw new Error("Enter a valid full name");
      if (!cleanEmail || !cleanEmail.includes("@")) throw new Error("Enter a valid email address");

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("You must be signed in to create an invitation");

      const { data: isAdmin, error: roleError } = await (supabase as any).rpc("has_role", {
        _user_id: authData.user.id,
        _role: "admin",
      });
      if (roleError) throw new Error(roleError.message);
      if (!isAdmin) throw new Error("Administrator access required");

      const token = randomToken();
      const tokenHash = await sha256Hex(token);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: invitation, error } = await (supabase as any)
        .from("user_invitations")
        .insert({
          church_id: churchId,
          email: cleanEmail,
          full_name: cleanName,
          phone: cleanPhone,
          role,
          member_id: null,
          token_hash: tokenHash,
          invited_by: authData.user.id,
          expires_at: expiresAt,
        })
        .select("id,email,full_name,role,church_id,member_id,expires_at,accepted_at,revoked_at,created_at")
        .single();

      if (error) throw new Error(error.message);

      await (supabase as any).from("audit_log").insert({
        church_id: churchId,
        user_id: authData.user.id,
        action: "user_invited",
        entity: "user_invitations",
        entity_id: invitation.id,
        details: { email: cleanEmail, role, expires_at: expiresAt },
      });

      return { invitation, invitationUrl: `/auth?invite=${encodeURIComponent(token)}` };
    },
    onSuccess: (res) => {
      const url = `${window.location.origin}${res.invitationUrl}`;
      setInvitationUrl(url);
      navigator.clipboard?.writeText(url).catch(() => undefined);
      toast.success("Invitation created and copied to clipboard");
      setFullName("");
      setEmail("");
      setPhone("");
      qc.invalidateQueries({ queryKey: ["church-invitations", churchId] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const revokeInvite = useMutation({
    mutationFn: async (id: string) => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("You must be signed in");

      const { data: isAdmin, error: roleError } = await (supabase as any).rpc("has_role", {
        _user_id: authData.user.id,
        _role: "admin",
      });
      if (roleError) throw new Error(roleError.message);
      if (!isAdmin) throw new Error("Administrator access required");

      const { data: row, error } = await (supabase as any)
        .from("user_invitations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .eq("church_id", churchId)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .select("church_id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Invitation is already accepted, revoked, or unavailable");

      await (supabase as any).from("audit_log").insert({
        church_id: churchId,
        user_id: authData.user.id,
        action: "user_invitation_revoked",
        entity: "user_invitations",
        entity_id: id,
        details: {},
      });
    },
    onSuccess: () => {
      toast.success("Invitation revoked");
      qc.invalidateQueries({ queryKey: ["church-invitations", churchId] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const { data: invitations = [], isLoading, isError, error } = invitationsQuery;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Invite user</CardTitle>
        <CardDescription>
          Administrators never set or see a user password. The recipient creates their own password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4 items-end">
          <div>
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Mwikali" />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07..." />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((item) => (
                  <SelectItem key={item} value={item} className="capitalize">{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          onClick={() => addUser.mutate()}
          disabled={addUser.isPending || !fullName.trim() || !email.trim()}
        >
          {addUser.isPending ? "Creating invitation…" : "Create invitation"}
        </Button>

        {invitationUrl && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
            <p className="text-sm font-medium">Invitation link</p>
            <div className="flex gap-2">
              <Input value={invitationUrl} readOnly />
              <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(invitationUrl)}>
                Copy
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Expires after 7 days and can only be completed with the invited email address.
            </p>
          </div>
        )}

        <div className="overflow-x-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading invitations…</p>
          ) : isError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm space-y-2">
              <p className="font-medium">Could not load user invitations.</p>
              <p className="text-muted-foreground break-words">{errorMessage(error)}</p>
              <p className="text-xs text-muted-foreground">
                The invitation list now uses the browser Supabase client with the signed-in administrator session. No service-role key is required.
              </p>
              <Button size="sm" variant="outline" onClick={() => invitationsQuery.refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invitations.map((item) => {
                  const active = !item.accepted_at && !item.revoked_at && new Date(item.expires_at).getTime() > Date.now();
                  return (
                    <tr key={item.id} className="border-t border-border">
                      <td className="py-1 pr-4">{item.full_name}</td>
                      <td className="py-1 pr-4">{item.email}</td>
                      <td className="py-1 pr-4 capitalize">{item.role}</td>
                      <td className="py-1 pr-4">
                        {item.accepted_at ? "Accepted" : item.revoked_at ? "Revoked" : active ? "Pending" : "Expired"}
                      </td>
                      <td className="py-1 text-right">
                        {active && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            disabled={revokeInvite.isPending}
                            onClick={() => revokeInvite.mutate(item.id)}
                          >
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
