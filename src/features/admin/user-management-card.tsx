import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listManagedUsers,
  setUserApproval,
  updateManagedUser,
  deleteManagedUser,
  type ManagedUser,
} from "@/lib/admin.functions";
import { invitedRoleFor } from "@/lib/invite-link";

type Role = "admin" | "pastor" | "elder" | "treasurer" | "auditor" | "member";

const ROLE_HELP: Record<Role, string> = {
  admin: "Super administrator — every module plus this panel.",
  treasurer: "Full rights across every module.",
  elder: "Full rights across every module.",
  pastor: "Can view and download all reports and statements (read-only).",
  auditor: "Read-only access to reports and the audit trail.",
  member: "Can only view their own contributions and download their receipts.",
};

export function UserManagementCard({ churchId }: { churchId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listManagedUsers);
  const approve = useServerFn(setUserApproval);
  const update = useServerFn(updateManagedUser);
  const remove = useServerFn(deleteManagedUser);

  const [approveRoles, setApproveRoles] = useState<Record<string, Role>>({});
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState({ fullName: "", phone: "", role: "member" as Role, sendReset: false });

  const { data: users = [], isLoading, error: listError } = useQuery({
    queryKey: ["managed-users"],
    queryFn: () => list(),
    refetchInterval: 20_000,
  });

  const pending = useMemo(() => users.filter((u) => u.approvalStatus === "pending"), [users]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["managed-users"] });

  const decide = useMutation({
    mutationFn: (v: { userId: string; decision: "approved" | "rejected"; reason?: string }) =>
      approve({ data: v }),
    onSuccess: () => { toast.success("Updated"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  // Approve and assign the role + church in one step. The role is set first so a
  // failure never leaves someone approved without access rights.
  const approveWithRole = useMutation({
    mutationFn: async (v: { userId: string; role: Role }) => {
      await update({ data: { userId: v.userId, role: v.role, churchId } });
      await approve({ data: { userId: v.userId, decision: "approved" } });
    },
    onSuccess: (_d, v) => { toast.success(`Approved as ${v.role}`); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const toggleActive = useMutation({
    mutationFn: (v: { userId: string; isActive: boolean }) => update({ data: v }),
    onSuccess: () => { toast.success("Account updated"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      await update({
        data: {
          userId: editing.userId,
          fullName: form.fullName.trim(),
          phone: form.phone.trim() || null,
          role: form.role,
          churchId,
          ...(form.sendReset
            ? {
                sendPasswordReset: true,
                redirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth` : undefined,
              }
            : {}),
        },
      });
    },
    onSuccess: () => {
      toast.success(form.sendReset ? "Profile saved and reset email sent" : "Profile saved");
      setEditing(null);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const doDelete = useMutation({
    mutationFn: async () => { if (deleting) await remove({ data: { userId: deleting.userId } }); },
    onSuccess: () => { toast.success("Account removed"); setDeleting(null); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  function openEdit(u: ManagedUser) {
    setEditing(u);
    setForm({
      fullName: u.fullName === "—" ? "" : u.fullName,
      phone: u.phone ?? "",
      role: ((u.roles[0] as Role) ?? "member"),
      sendReset: false,
    });
  }

  return (
    <>
      <Card className={pending.length > 0 ? "border-primary/40" : undefined}>
          <CardHeader>
            <CardTitle className="text-base">Pending approvals ({pending.length})</CardTitle>
            <CardDescription>
              People you invited are approved automatically with their invited role (administrator invitations excepted).
              Anyone who signed up without an invitation waits here for you to approve them.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {listError && (
              <p className="text-sm text-destructive">Could not load accounts: {(listError as Error).message}</p>
            )}
            {!listError && !isLoading && pending.length === 0 && (
              <p className="text-sm text-muted-foreground">No one is waiting for approval.</p>
            )}
            {pending.map((u) => (
              <div
                key={u.userId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{u.fullName}</div>
                  <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={approveRoles[u.userId] ?? invitedRoleFor(u.email) ?? "member"}
                    onValueChange={(v) => setApproveRoles((cur) => ({ ...cur, [u.userId]: v as Role }))}
                  >
                    <SelectTrigger className="h-8 w-32 capitalize"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ROLE_HELP) as Role[]).map((r) => (
                        <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={approveWithRole.isPending}
                    onClick={() =>
                      approveWithRole.mutate({
                        userId: u.userId,
                        role: approveRoles[u.userId] ?? invitedRoleFor(u.email) ?? "member",
                      })
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      decide.mutate({
                        userId: u.userId,
                        decision: "rejected",
                        reason: "Registration declined by administrator",
                      })
                    }
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manage user accounts</CardTitle>
          <CardDescription>
            Edit profiles, change roles, suspend access or delete accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading accounts…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.userId} className="border-t border-border align-middle">
                      <td className="py-2 pr-4">{u.fullName}</td>
                      <td className="py-2 pr-4">{u.email}</td>
                      <td className="py-2 pr-4 capitalize">{u.roles.join(", ") || "—"}</td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap gap-1">
                          <Badge
                            variant={u.approvalStatus === "approved" ? "secondary" : "outline"}
                            className="capitalize"
                          >
                            {u.approvalStatus}
                          </Badge>
                          {!u.isActive && <Badge variant="destructive">Suspended</Badge>}
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              toggleActive.mutate({ userId: u.userId, isActive: !u.isActive })
                            }
                          >
                            {u.isActive ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => setDeleting(u)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit account</DialogTitle>
            <DialogDescription>{editing?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Full name</Label>
              <Input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="pastor">Pastor</SelectItem>
                  <SelectItem value="elder">Elder</SelectItem>
                  <SelectItem value="treasurer">Treasurer</SelectItem>
                  <SelectItem value="auditor">Auditor</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">{ROLE_HELP[form.role]}</p>
            </div>
            <div className="md:col-span-2 flex items-start gap-2 rounded-md border border-border p-3">
              <input
                id="send-reset"
                type="checkbox"
                className="mt-1"
                checked={form.sendReset}
                onChange={(e) => setForm({ ...form, sendReset: e.target.checked })}
              />
              <Label htmlFor="send-reset" className="font-normal">
                Email this person a password reset link
                <span className="block text-xs text-muted-foreground">
                  They choose their own new password from the link.
                </span>
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>
              {saveEdit.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this account?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.email} will lose access permanently. Records they captured stay in the
              system and the deletion is written to the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => doDelete.mutate()}>Delete account</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
