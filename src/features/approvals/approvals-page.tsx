import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/format";

type PendingRow = {
  kind: "receipt" | "expense" | "cash_statement" | "weekly_report";
  id: string;
  ref: string;
  date: string;
  amount: number | null;
  submitted_at: string | null;
  church_name: string | null;
};

export function ApprovalsPage() {
  const qc = useQueryClient();
  const [rejectFor, setRejectFor] = useState<PendingRow | null>(null);
  const [reason, setReason] = useState("");

  const { data: rows = [], isLoading, error: queueError } = useQuery({
    queryKey: ["approvals-queue"],
    queryFn: async (): Promise<PendingRow[]> => {
      const [rc, ex, cs, wr] = await Promise.all([
        supabase.from("receipts")
          .select("id,receipt_number,transaction_date,amount,submitted_at,churches(name)")
          .eq("approval_status", "pending").order("submitted_at", { ascending: false }),
        supabase.from("expenses")
          .select("id,expense_number,transaction_date,amount,submitted_at,churches(name)")
          .eq("approval_status", "pending").order("submitted_at", { ascending: false }),
        supabase.from("cash_statements")
          .select("id,period_year,period_month,statement_date,submitted_at,churches(name)")
          .eq("approval_status", "pending").order("submitted_at", { ascending: false }),
        supabase.from("weekly_reports")
          .select("id,period_year,period_month,submitted_at,churches(name)")
          .eq("approval_status", "pending").order("submitted_at", { ascending: false }),
      ]);
      const failed = [rc, ex, cs, wr].find((r) => r.error);
      if (failed?.error) throw new Error(failed.error.message);

      const out: PendingRow[] = [];
      (rc.data ?? []).forEach((r: any) => out.push({
        kind: "receipt", id: r.id, ref: r.receipt_number, date: r.transaction_date,
        amount: Number(r.amount), submitted_at: r.submitted_at, church_name: r.churches?.name ?? null,
      }));
      (ex.data ?? []).forEach((r: any) => out.push({
        kind: "expense", id: r.id, ref: r.expense_number, date: r.transaction_date,
        amount: Number(r.amount), submitted_at: r.submitted_at, church_name: r.churches?.name ?? null,
      }));
      (cs.data ?? []).forEach((r: any) => out.push({
        kind: "cash_statement", id: r.id, ref: `${r.period_year}-${String(r.period_month + 1).padStart(2, "0")}`,
        date: r.statement_date ?? "", amount: null, submitted_at: r.submitted_at, church_name: r.churches?.name ?? null,
      }));
      (wr.data ?? []).forEach((r: any) => out.push({
        kind: "weekly_report", id: r.id, ref: `${r.period_year}-${String(r.period_month + 1).padStart(2, "0")}`,
        date: "", amount: null, submitted_at: r.submitted_at, church_name: r.churches?.name ?? null,
      }));
      return out;
    },
  });

  async function approve(row: PendingRow) {
    const { data: u } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      approval_status: "approved",
      approved_at: now,
      approved_by: u.user?.id ?? null,
    };
    const table = row.kind === "cash_statement" ? "cash_statements"
      : row.kind === "weekly_report" ? "weekly_reports"
      : row.kind === "receipt" ? "receipts" : "expenses";
    const { data, error } = await (supabase.from(table) as any)
      .update(patch)
      .eq("id", row.id)
      .select("id");
    if (error) { toast.error(error.message); return; }
    if (!data || data.length === 0) {
      toast.error("You don't have permission to approve this record.");
      return;
    }
    toast.success("Approved");
    qc.invalidateQueries({ queryKey: ["approvals-queue"] });
    qc.invalidateQueries({ queryKey: [table] });
  }

  async function doReject() {
    if (!rejectFor) return;
    if (!reason.trim()) { toast.error("Please provide a reason"); return; }
    const table = rejectFor.kind === "cash_statement" ? "cash_statements"
      : rejectFor.kind === "weekly_report" ? "weekly_reports"
      : rejectFor.kind === "receipt" ? "receipts" : "expenses";
    const { data, error } = await (supabase.from(table) as any)
      .update({ approval_status: "rejected", rejection_reason: reason.trim() })
      .eq("id", rejectFor.id)
      .select("id");
    if (error) { toast.error(error.message); return; }
    if (!data || data.length === 0) {
      toast.error("You don't have permission to reject this record.");
      return;
    }
    toast.success("Rejected");
    setRejectFor(null); setReason("");
    qc.invalidateQueries({ queryKey: ["approvals-queue"] });
    qc.invalidateQueries({ queryKey: [table] });
  }

  const kindLabel: Record<PendingRow["kind"], string> = {
    receipt: "Receipt", expense: "Expense", cash_statement: "Cash Statement", weekly_report: "Weekly Report",
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Approvals" description="Review and approve records submitted by treasurers." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" /> Pending submissions ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {queueError ? (
            <div className="text-sm text-destructive py-6 text-center">
              Could not load submissions: {(queueError as Error).message}
            </div>
          ) : isLoading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-10 text-center">
              Nothing pending — you're all caught up.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Reference</th>
                    <th className="py-2 pr-4">Church</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                    <th className="py-2 pr-4">Submitted</th>
                    <th className="py-2 pr-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.kind}-${r.id}`} className="border-t border-border">
                      <td className="py-2 pr-4">{kindLabel[r.kind]}</td>
                      <td className="py-2 pr-4 font-mono">{r.ref}</td>
                      <td className="py-2 pr-4">{r.church_name ?? "—"}</td>
                      <td className="py-2 pr-4">{r.date || "—"}</td>
                      <td className="py-2 pr-4 text-right">{r.amount != null ? formatCurrency(r.amount) : "—"}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => approve(r)}>
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive"
                            onClick={() => { setRejectFor(r); setReason(""); }}>
                            <XCircle className="h-4 w-4 mr-1" /> Reject
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

      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject submission</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">The treasurer will be able to edit and resubmit.</p>
            <Label>Reason</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Wrong total, missing supporting document…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button variant="destructive" onClick={doReject}>Confirm rejection</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}