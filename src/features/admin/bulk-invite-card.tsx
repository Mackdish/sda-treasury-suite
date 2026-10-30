import { useState } from "react";
import { buildInviteLink, rememberInvitedRole } from "@/lib/invite-link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { recordInvitations } from "@/lib/admin.functions";

type Role = "admin" | "pastor" | "elder" | "treasurer" | "auditor" | "member";
type Result = { email: string; fullName: string; role: string; invitationUrl: string };
const ROLES: Role[] = ["admin", "pastor", "elder", "treasurer", "auditor", "member"];

function parseRows(text: string, fallback: Role) {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const [name = "", email = "", role = ""] = line.split(",").map((p) => p.trim());
    const r = ROLES.includes(role.toLowerCase() as Role) ? role.toLowerCase() as Role : fallback;
    return { fullName: name, email, role: r };
  }).filter((r) => r.fullName.length >= 2 && r.email.includes("@"));
}

export function BulkInviteCard({ churchId }: { churchId: string }) {
  const record = useServerFn(recordInvitations);
  const [text, setText] = useState("");
  const [defaultRole, setDefaultRole] = useState<Role>("member");
  const [results, setResults] = useState<Result[]>([]);
  const rows = parseRows(text, defaultRole);

  function createInvitations() {
    if (!rows.length) return toast.error("Add at least one line: Full name, email, role");
    // One link per unique email; the role is remembered here to pre-select it on approval.
    const seen = new Set<string>();
    const out: Result[] = [];
    for (const r of rows) {
      const email = r.email.trim().toLowerCase();
      if (seen.has(email)) continue;
      seen.add(email);
      rememberInvitedRole(email, r.role);
      out.push({ fullName: r.fullName, email, role: r.role, invitationUrl: buildInviteLink(window.location.origin, { fullName: r.fullName, email }) });
    }
    setResults(out);
    record({ data: { churchId, invites: out.map((o) => ({ email: o.email, fullName: o.fullName, role: o.role as Role })) } }).catch((e) =>
      toast.error(`Links created, but automatic approval is unavailable: ${e?.message ?? "could not save the invitations"}`),
    );
    toast.success(`${out.length} invitation link${out.length === 1 ? "" : "s"} created`);
  }

  function downloadLinks() {
    const head = ["Full name", "Email", "Role", "Invitation link"];
    const body = results.map((r) => [r.fullName, r.email, r.role, r.invitationUrl]);
    const csv = [head, ...body].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "user-invitations.csv"; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bulk user invitations</CardTitle>
        <CardDescription>Create sign-up links for many people at once. They are approved automatically with the chosen role after signing up (administrator invitations need a manual approval). No passwords are generated or exposed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_200px]">
          <div><Label>One person per line — Full name, email, role (role optional)</Label><Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Jane Mwikali, jane@example.com, member\nPeter Kioko, peter@example.com, elder"} /></div>
          <div><Label>Default role</Label><Select value={defaultRole} onValueChange={(v) => setDefaultRole(v as Role)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent></Select><p className="mt-2 text-xs text-muted-foreground">{rows.length} valid line{rows.length === 1 ? "" : "s"} detected.</p></div>
        </div>
        <div className="flex flex-wrap gap-2"><Button onClick={createInvitations} disabled={!rows.length}>Create invitations</Button>{results.length > 0 && <Button variant="secondary" onClick={downloadLinks}>Download invitation CSV</Button>}</div>
        {results.length > 0 && <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-4">Name</th><th className="py-2 pr-4">Email</th><th className="py-2 pr-4">Role</th><th className="py-2 pr-4">Link</th></tr></thead><tbody>{results.map((r) => <tr key={r.email} className="border-t border-border"><td className="py-1 pr-4">{r.fullName}</td><td className="py-1 pr-4">{r.email}</td><td className="py-1 pr-4 capitalize">{r.role}</td><td className="py-1 pr-4 max-w-sm truncate font-mono text-xs">{r.invitationUrl}</td></tr>)}</tbody></table></div>}
      </CardContent>
    </Card>
  );
}
