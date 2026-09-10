import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createUserInvitation, listUserInvitations, revokeUserInvitation } from "@/lib/users.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Role = "admin" | "pastor" | "elder" | "treasurer" | "auditor" | "member";

const ROLES: Role[] = ["admin", "pastor", "elder", "treasurer", "auditor", "member"];

export function UserAccountsCard({ churchId }: { churchId: string }) {
  const qc = useQueryClient();
  const create = useServerFn(createUserInvitation);
  const list = useServerFn(listUserInvitations);
  const revoke = useServerFn(revokeUserInvitation);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("treasurer");
  const [invitationUrl, setInvitationUrl] = useState("");

  const { data: invitations = [], isLoading } = useQuery({
    queryKey: ["church-invitations", churchId],
    queryFn: () => list({ data: { churchId } }),
  });

  const addUser = useMutation({
    mutationFn: () => create({ data: { email: email.trim(), fullName: fullName.trim(), phone: phone.trim() || null, role, churchId } }),
    onSuccess: (res) => {
      const url = `${window.location.origin}${res.invitationUrl}`;
      setInvitationUrl(url);
      navigator.clipboard?.writeText(url).catch(() => undefined);
      toast.success("Invitation created and copied to clipboard");
      setFullName(""); setEmail(""); setPhone("");
      qc.invalidateQueries({ queryKey: ["church-invitations", churchId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not create the invitation"),
  });

  const revokeInvite = useMutation({
    mutationFn: (id: string) => revoke({ data: { invitationId: id } }),
    onSuccess: () => { toast.success("Invitation revoked"); qc.invalidateQueries({ queryKey: ["church-invitations", churchId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Could not revoke invitation"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Invite user</CardTitle>
        <CardDescription>Administrators never set or see a user password. The recipient creates their own password.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4 items-end">
          <div><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Mwikali" /></div>
          <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" /></div>
          <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><Label>Role</Label><Select value={role} onValueChange={(v) => setRole(v as Role)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <Button onClick={() => addUser.mutate()} disabled={addUser.isPending || !fullName.trim() || !email.trim()}>
          {addUser.isPending ? "Creating invitation…" : "Create invitation"}
        </Button>

        {invitationUrl && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
            <p className="text-sm font-medium">Invitation link</p>
            <div className="flex gap-2"><Input value={invitationUrl} readOnly /><Button variant="secondary" onClick={() => navigator.clipboard?.writeText(invitationUrl)}>Copy</Button></div>
            <p className="text-xs text-muted-foreground">This link expires after 7 days and can be used only by the invited email address.</p>
          </div>
        )}

        <div className="overflow-x-auto">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading invitations…</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-4">Name</th><th className="py-2 pr-4">Email</th><th className="py-2 pr-4">Role</th><th className="py-2 pr-4">Status</th><th /></tr></thead>
              <tbody>
                {invitations.map((i) => {
                  const active = !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt).getTime() > Date.now();
                  return <tr key={i.id} className="border-t border-border">
                    <td className="py-1 pr-4">{i.fullName}</td><td className="py-1 pr-4">{i.email}</td><td className="py-1 pr-4 capitalize">{i.role}</td>
                    <td className="py-1 pr-4">{i.acceptedAt ? "Accepted" : i.revokedAt ? "Revoked" : active ? "Pending" : "Expired"}</td>
                    <td className="py-1 text-right">{active && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => revokeInvite.mutate(i.id)}>Revoke</Button>}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
