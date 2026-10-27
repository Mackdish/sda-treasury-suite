import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, Mail, MessageCircle } from "lucide-react";
import { useCurrentChurch } from "@/lib/church";
import {
  INVITE_ROLES,
  buildInviteLink,
  inviteMessage,
  rememberInvitedRole,
  whatsappNumber,
  type InviteRole,
} from "@/lib/invite-link";

type Created = { fullName: string; email: string; phone: string; role: InviteRole; link: string };

/**
 * Invite a user by sign-up link. No invitation table is needed: the link
 * pre-fills the person's details, and once they sign up they appear under
 * "Pending approvals" where the administrator approves them with a role.
 */
export function UserAccountsCard(_props: { churchId: string }) {
  const { data: church } = useCurrentChurch();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<InviteRole>("treasurer");
  const [created, setCreated] = useState<Created | null>(null);

  function createInvitation() {
    const name = fullName.trim();
    const mail = email.trim().toLowerCase();
    if (name.length < 2) return toast.error("Enter a valid full name");
    if (!mail.includes("@")) return toast.error("Enter a valid email address");

    const link = buildInviteLink(window.location.origin, { fullName: name, email: mail, phone });
    rememberInvitedRole(mail, role);
    setCreated({ fullName: name, email: mail, phone: phone.trim(), role, link });
    navigator.clipboard?.writeText(link).then(
      () => toast.success("Invitation link created and copied"),
      () => toast.success("Invitation link created"),
    );
    setFullName("");
    setEmail("");
    setPhone("");
  }

  const wa = created ? whatsappNumber(created.phone) : null;
  const message = created ? inviteMessage(church?.name, created.fullName, created.link) : "";

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
            <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVITE_ROLES.map((item) => (
                  <SelectItem key={item} value={item} className="capitalize">{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={createInvitation} disabled={!fullName.trim() || !email.trim()}>
          Create invitation
        </Button>

        {created && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
            <p className="text-sm font-medium">Invitation link for {created.fullName}</p>
            <div className="flex gap-2">
              <Input value={created.link} readOnly />
              <Button variant="secondary" onClick={() => { navigator.clipboard?.writeText(created.link); toast.success("Copied"); }}>
                <Copy className="h-4 w-4 mr-1" /> Copy
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {wa && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`https://wa.me/${wa}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4 mr-1" /> Send on WhatsApp
                  </a>
                </Button>
              )}
              <Button variant="outline" size="sm" asChild>
                <a href={`mailto:${created.email}?subject=${encodeURIComponent("Your SDA Treasurer invitation")}&body=${encodeURIComponent(message)}`}>
                  <Mail className="h-4 w-4 mr-1" /> Send by email
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Next steps: send them the link. After they create their account they will appear under
              <span className="font-medium"> Pending approvals</span> above, with the role
              <span className="font-medium capitalize"> {created.role}</span> pre-selected. Approve them there to give access.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
