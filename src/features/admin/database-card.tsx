import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { databaseOverview, clearTableData, type ManagedTable } from "@/lib/admin.functions";

const LABELS: Record<string, string> = {
  receipts: "Receipts",
  expenses: "Expenses",
  cash_statements: "Cash statements",
  weekly_reports: "Weekly reports",
  remittances: "Remittances",
  church_members: "Members",
  departments: "Departments",
  notices: "Notices",
  audit_log: "Audit trail",
};

export function DatabaseCard({ churchId }: { churchId: string }) {
  const qc = useQueryClient();
  const overview = useServerFn(databaseOverview);
  const clear = useServerFn(clearTableData);
  const [target, setTarget] = useState<ManagedTable | null>(null);
  const [confirm, setConfirm] = useState("");

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["db-overview"],
    queryFn: () => overview(),
  });

  const doClear = useMutation({
    mutationFn: async () => {
      if (!target) return { deleted: 0 };
      return clear({ data: { table: target, churchId, confirm: "DELETE" as const } });
    },
    onSuccess: (res) => {
      toast.success(`Deleted ${res.deleted} record(s). A snapshot was written to the audit trail.`);
      setTarget(null);
      setConfirm("");
      qc.invalidateQueries({ queryKey: ["db-overview"] });
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not clear the records"),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">Database records</CardTitle>
          <CardDescription>
            Review how much data each area holds. Clearing is permanent — a snapshot is saved to the
            audit trail first.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => qc.invalidateQueries({ queryKey: ["db-overview"] })}
          disabled={isFetching}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">Records</th>
                <th className="py-2 pr-4">Count</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.table} className="border-t border-border">
                  <td className="py-2 pr-4">{LABELS[r.table] ?? r.table}</td>
                  <td className="py-2 pr-4 tabular-nums">{r.count}</td>
                  <td className="py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={r.count === 0}
                      onClick={() => {
                        setTarget(r.table as ManagedTable);
                        setConfirm("");
                      }}
                    >
                      Clear
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> Clear{" "}
              {target ? (LABELS[target] ?? target).toLowerCase() : ""}?
            </DialogTitle>
            <DialogDescription>
              This permanently removes every one of these records for your church. A copy is stored
              in the audit trail before deletion. Type DELETE to confirm.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Confirmation</Label>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirm !== "DELETE" || doClear.isPending}
              onClick={() => doClear.mutate()}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
