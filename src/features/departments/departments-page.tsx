import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentChurch } from "@/lib/church";
import { PageHeader, NoChurch } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { PeriodPicker } from "@/components/period-picker";
import { periodRange, downloadCsv, type PeriodKind } from "@/lib/periods";
import { printElement } from "@/lib/print";
import { Download, Plus, Printer, Trash2 } from "lucide-react";

type Dept = { id: string; name: string; code: string | null; is_active: boolean };

export function DepartmentsPage() {
  const { data: church } = useCurrentChurch();
  const qc = useQueryClient();
  const [kind, setKind] = useState<PeriodKind>("monthly");
  const [anchor, setAnchor] = useState(new Date().toISOString().slice(0, 10));
  const { start, end, label } = periodRange(kind, anchor);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [focus, setFocus] = useState<string | null>(null);

  const { data: depts = [] } = useQuery({
    queryKey: ["departments", church?.id],
    enabled: !!church,
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id,name,code,is_active").eq("church_id", church!.id).order("sort_order").order("name");
      return (data ?? []) as Dept[];
    },
  });

  const { data: rows = [] } = useQuery({
    queryKey: ["dept-contrib", church?.id, start, end],
    enabled: !!church,
    queryFn: async () => {
      const { data } = await supabase
        .from("receipts")
        .select("id,amount,transaction_date,member_name,department_id,offering_categories(name,fund_type)")
        .neq("approval_status", "deleted")
        .eq("church_id", church!.id)
        .gte("transaction_date", start)
        .lte("transaction_date", end)
        .limit(2000);
      return (data ?? []) as any[];
    },
  });

  const { data: expRows = [] } = useQuery({
    queryKey: ["dept-expenses", church?.id, start, end],
    enabled: !!church,
    queryFn: async () => {
      const { data } = await supabase
        .from("expenses")
        .select("id,amount,department_id")
        .eq("church_id", church!.id)
        .gte("transaction_date", start)
        .lte("transaction_date", end)
        .limit(2000);
      return (data ?? []) as any[];
    },
  });

  const summary = useMemo(() => {
    const m = new Map<string, { id: string | null; name: string; total: number; count: number; spent: number }>();
    const nameOf = (id: string | null) => depts.find((d) => d.id === id)?.name ?? "Unassigned";
    depts.forEach((d) => m.set(d.id, { id: d.id, name: d.name, total: 0, count: 0, spent: 0 }));
    rows.forEach((r) => {
      const key = r.department_id ?? "none";
      const cur = m.get(key) ?? { id: r.department_id ?? null, name: nameOf(r.department_id), total: 0, count: 0, spent: 0 };
      cur.total += Number(r.amount);
      cur.count += 1;
      m.set(key, cur);
    });
    expRows.forEach((e) => {
      const key = e.department_id ?? "none";
      const cur = m.get(key) ?? { id: e.department_id ?? null, name: nameOf(e.department_id), total: 0, count: 0, spent: 0 };
      cur.spent += Number(e.amount);
      m.set(key, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [rows, expRows, depts]);

  const focusRows = useMemo(() => rows.filter((r) => (r.department_id ?? "none") === focus), [rows, focus]);
  const focusByCategory = useMemo(() => {
    const m = new Map<string, { name: string; fund: string; total: number }>();
    focusRows.forEach((r) => {
      const n = r.offering_categories?.name ?? "Uncategorised";
      const cur = m.get(n) ?? { name: n, fund: r.offering_categories?.fund_type ?? "local", total: 0 };
      cur.total += Number(r.amount);
      m.set(n, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [focusRows]);

  const add = useMutation({
    mutationFn: async () => {
      if (!church || !name.trim()) throw new Error("Department name is required");
      const { error } = await supabase.from("departments").insert({ church_id: church.id, name: name.trim(), code: code.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Department added"); setName(""); setCode(""); qc.invalidateQueries({ queryKey: ["departments"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("departments").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Department removed"); qc.invalidateQueries({ queryKey: ["departments"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const grandTotal = summary.reduce((s, d) => s + d.total, 0);
  const focusName = summary.find((d) => (d.id ?? "none") === focus)?.name ?? "";

  if (!church) return <><PageHeader title="Departments" /><NoChurch /></>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Departments"
        description="Department register with contributions, spending and per-department reports."
        actions={
          <>
            <Button variant="outline" onClick={() => downloadCsv(`departments_${start}_${end}.csv`, [
              ["Department", "Receipts", "Contributions", "Expenses", "Net"],
              ...summary.map((d) => [d.name, d.count, d.total, d.spent, d.total - d.spent]),
            ])}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
            <Button onClick={() => printElement("dept-report", "Department Report")}><Printer className="h-4 w-4 mr-1" /> Print</Button>
          </>
        }
      />

      <Card className="no-print">
        <CardContent className="pt-6">
          <PeriodPicker kind={kind} anchor={anchor} onKind={setKind} onAnchor={setAnchor} label={`${label} (${start} → ${end})`} />
        </CardContent>
      </Card>

      <div id="dept-report" className="space-y-4">
        <div className="text-center border-b border-border pb-3">
          <div className="font-bold text-primary text-lg">{church.name}</div>
          <div className="font-semibold mt-1">DEPARTMENT CONTRIBUTIONS — {label} ({start} to {end})</div>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">Departments</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Department</th>
                  <th className="py-2 pr-4 text-right">Receipts</th>
                  <th className="py-2 pr-4 text-right">Contributions</th>
                  <th className="py-2 pr-4 text-right">Expenses</th>
                  <th className="py-2 pr-4 text-right">Net</th>
                  <th className="py-2 pr-4 no-print"></th>
                </tr>
              </thead>
              <tbody>
                {summary.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No departments yet.</td></tr>}
                {summary.map((d) => (
                  <tr key={d.id ?? "none"} className="border-t border-border">
                    <td className="py-2 pr-4">{d.name}</td>
                    <td className="py-2 pr-4 text-right">{d.count}</td>
                    <td className="py-2 pr-4 text-right">{formatCurrency(d.total)}</td>
                    <td className="py-2 pr-4 text-right">{formatCurrency(d.spent)}</td>
                    <td className="py-2 pr-4 text-right font-medium">{formatCurrency(d.total - d.spent)}</td>
                    <td className="py-2 pr-4 text-right no-print">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setFocus(d.id ?? "none")}>Report</Button>
                        {d.id && (
                          <Button size="sm" variant="ghost" onClick={() => remove.mutate(d.id!)}><Trash2 className="h-4 w-4" /></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="py-2 pr-4">Total</td><td /><td className="py-2 pr-4 text-right">{formatCurrency(grandTotal)}</td>
                  <td className="py-2 pr-4 text-right">{formatCurrency(summary.reduce((s, d) => s + d.spent, 0))}</td>
                  <td className="py-2 pr-4 text-right">{formatCurrency(grandTotal - summary.reduce((s, d) => s + d.spent, 0))}</td>
                  <td className="no-print" />
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>

        {focus && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{focusName} — detailed report</CardTitle>
              <Button size="sm" variant="ghost" className="no-print" onClick={() => setFocus(null)}>Close</Button>
            </CardHeader>
            <CardContent className="space-y-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-4">Category</th><th className="py-2 pr-4">Fund</th><th className="py-2 pr-4 text-right">Amount</th></tr></thead>
                <tbody>
                  {focusByCategory.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">No contributions in this period.</td></tr>}
                  {focusByCategory.map((c) => (
                    <tr key={c.name} className="border-t border-border">
                      <td className="py-2 pr-4">{c.name}</td>
                      <td className="py-2 pr-4 capitalize">{c.fund}</td>
                      <td className="py-2 pr-4 text-right">{formatCurrency(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Giver</th><th className="py-2 pr-4">Category</th><th className="py-2 pr-4 text-right">Amount</th></tr></thead>
                <tbody>
                  {focusRows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-1 pr-4">{r.transaction_date}</td>
                      <td className="py-1 pr-4">{r.member_name ?? "—"}</td>
                      <td className="py-1 pr-4">{r.offering_categories?.name ?? "—"}</td>
                      <td className="py-1 pr-4 text-right">{formatCurrency(Number(r.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="no-print">
        <CardHeader><CardTitle className="text-base">Add a department</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Youth Ministries" /></div>
          <div><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="AY" /></div>
          <div className="flex items-end"><Button onClick={() => add.mutate()} disabled={add.isPending}><Plus className="h-4 w-4 mr-1" /> Add</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}
