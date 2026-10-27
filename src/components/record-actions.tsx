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
import { deleteRecord } from "@/lib/delete-record";

type TableName = "receipts" | "expenses";

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
      await deleteRecord(table, id);
    },
    onSuccess: () => {
      toast.success(`${table === "receipts" ? "Receipt" : "Expense"} deleted`);
      setConfirmOpen(false);
      setConfirmation("");
      // Remove the row from every cached list straight away so it vanishes
      // from the UI immediately, then refetch to confirm with the database.
      qc.setQueriesData({ queryKey: [table] }, (old: unknown) =>
        Array.isArray(old) ? old.filter((r: any) => r?.id !== id) : old,
      );
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
            This will remove the {table === "receipts" ? "receipt" : "expense"} and it will no longer appear anywhere in the app. Type DELETE to continue.
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
