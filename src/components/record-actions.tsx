import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { useUserRoles, hasAnyRole, isAdmin } from "@/lib/access";
import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TableName = "receipts" | "expenses";

const HIDDEN_RECEIPTS_KEY = "sda-treasury-hidden-receipts";

function getHiddenReceipts(): string[] {
  try {
    const value = localStorage.getItem(HIDDEN_RECEIPTS_KEY);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

function hideReceipt(id: string) {
  const ids = new Set(getHiddenReceipts());
  ids.add(id);
  localStorage.setItem(HIDDEN_RECEIPTS_KEY, JSON.stringify([...ids]));
  window.dispatchEvent(new CustomEvent("receipt-hidden", { detail: id }));
}

export function RecordActions({ table, id, approvalStatus, isLocked, onEdit, invalidateKeys }: { table: TableName; id: string; approvalStatus: "draft" | "pending" | "approved" | "rejected"; isLocked?: boolean; onEdit: () => void; invalidateKeys: string[] }) {
  const { data: roles = [] } = useUserRoles();
  const qc = useQueryClient();
  const admin = isAdmin(roles);
  const authorized = hasAnyRole(roles, ["admin", "treasurer", "elder"]);
  const editable = authorized && (admin || (!isLocked && (approvalStatus === "draft" || approvalStatus === "rejected")));
  const deletable = authorized && (admin || (!isLocked && (approvalStatus === "draft" || approvalStatus === "rejected")));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const remove = useMutation({
    mutationFn: async () => {
      if (confirmation !== "DELETE") throw new Error("Type DELETE to confirm deletion");

      if (table === "receipts") {
        // UI-only deletion: do not depend on a Supabase RPC or migration.
        hideReceipt(id);
        return;
      }

      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${table === "receipts" ? "Receipt removed from this device" : "Expense deleted"}`);
      setConfirmOpen(false);
      setConfirmation("");
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["funds"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Unable to delete record"),
  });

  if (!editable && !deletable) return null;

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        {editable && (
          <Button size="sm" variant="ghost" onClick={onEdit} title="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        {deletable && (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmOpen(true)} title="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {table === "receipts" ? "receipt" : "expense"}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {table === "receipts"
              ? "The receipt will disappear from this device. The database record will not be changed. Type DELETE to continue."
              : "This action is permanent and will be recorded in the audit trail. Type DELETE to continue."}
          </p>
          <div className="space-y-2">
            <Label>Confirmation</Label>
            <Input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="DELETE" autoComplete="off" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending || confirmation !== "DELETE"}>
              {remove.isPending ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
