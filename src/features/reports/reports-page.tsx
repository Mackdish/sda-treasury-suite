import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentChurch } from "@/lib/church";
import { PageHeader, NoChurch } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { printElement } from "@/lib/print";
import { PeriodPicker } from "@/components/period-picker";
import { periodRange, downloadCsv, FUND_LABELS, type PeriodKind } from "@/lib/periods";
import { Download, Printer } from "lucide-react";

export function ReportsPage() {
  const { data: church } = useCurrentChurch();
  const [kind, setKind] = useState<PeriodKind>("monthly");
  const [anchor, setAnchor] = useState(new Date().toISOString().slice(0, 10));
  const preset = periodRange(kind, anchor);
  const [custom, setCustom] = useState(false);
  const [cStart, setCStart] = useState(preset.start);
  const [cEnd, setCEnd] = useState(preset.end);
  const start = custom ? cStart : preset.start;
  const end = custom ? cEnd : preset.end;
  const label = custom ? `${cStart} to ${cEnd}` : preset.label;

  const { data } = useQuery({
    queryKey: ["report", church?.id, start, end],
    enabled: !!church,
    queryFn: async () => {
      const [rc, ex] = await Promise.all([
        supabase.from("receipts").select("transaction_date,receipt_number,member_name,amount,departments(name),offering_categories(name,fund_type,conference_split_pct)").neq("approval_status", "deleted").eq("church_id", church!.id).gte("transaction_date", start).lte("transaction_date", end).order("transaction_date"),
        supabase.from("expenses").select("transaction_date,amount,vendor,description,departments(name),expense_categories(name)").eq("church_id", church!.id).gte("transaction_date", start).lte("transaction_date", end).order("transaction_date"),
      ]);
      return { r: (rc.data ?? []) as any[], ex: (ex.data ?? []) as any[] };
    },
  });

  const receipts = data?.r ?? [];
  const expenses = data?.ex ?? [];
  const income = receipts.reduce((s, x) => s + Number(x.amount), 0);
  const spend = expenses.reduce((s, x) => s + Number(x.amount), 0);
  const conf = receipts.reduce((s, x) => s + Number(x.amount) * Number(x.offering_categories?.conference_split_pct ?? 0) / 100, 0);

  const byFund = useMemo(() => {
    const m = new Map<string, { total: number; conf: number; local: number }>();
    receipts.forEach((r) => {
      const fund = r.offering_categories?.fund_type ?? "local";
      const amt = Number(r.amount);
      const c = amt * Number(r.offering_categories?.conference_split_pct ?? 0) / 100;
      const cur = m.get(fund) ?? { total: 0, conf: 0, local: 0 };
      cur.total += amt; cur.conf += c; cur.local += amt - c;
      m.set(fund, cur);
    });
    return ["trust", "local", "camp"].map((f) => ({ fund: f, ...(m.get(f) ?? { total: 0, conf: 0, local: 0 }) }));
  }, [receipts]);

  const byDept = useMemo(() => {
    const m = new Map<string, { name: string; given: number; spent: number }>();
    receipts.forEach((r) => {
      const n = r.departments?.name ?? "Unassigned";
      const cur = m.get(n) ?? { name: n, given: 0, spent: 0 };
      cur.given += Number(r.amount); m.set(n, cur);
    });
    expenses.forEach((e) => {
      const n = e.departments?.name ?? "Unassigned";
      const cur = m.get(n) ?? { name: n, given: 0, spent: 0 };
      cur.spent += Number(e.amount); m.set(n, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.given - a.given);
  }, [receipts, expenses]);

  if (!church) return <><PageHeader title="Reports" /><NoChurch /></>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Daily, weekly, monthly, quarterly and annual reports with CSV export and printing."
        actions={
          <>
            <Button variant="outline" onClick={() => downloadCsv(`receipts_${start}_${end}.csv`, [
              ["Date","Receipt #","Member","Category","Fund","Department","Amount"],
              ...receipts.map((r) => [r.transaction_date, r.receipt_number, r.member_name ?? "", r.offering_categories?.name ?? "", r.offering_categories?.fund_type ?? "", r.departments?.name ?? "", r.amount]),
            ])}><Download className="h-4 w-4 mr-1" /> Receipts CSV</Button>
            <Button variant="outline" onClick={() => downloadCsv(`expenses_${start}_${end}.csv`, [
              ["Date","Category","Department","Vendor","Description","Amount"],
              ...expenses.map((r) => [r.transaction_date, r.expense_categories?.name ?? "", r.departments?.name ?? "", r.vendor ?? "", r.description ?? "", r.amount]),
            ])}><Download className="h-4 w-4 mr-1" /> Expenses CSV</Button>
            <Button onClick={() => printElement("full-report", "Financial Report")}><Printer className="h-4 w-4 mr-1" /> Print</Button>
          </>
        }
      />
      <Card className="no-print">
        <CardContent className="space-y-4 pt-6">
          <PeriodPicker kind={kind} anchor={anchor} onKind={setKind} onAnchor={setAnchor} label={`${preset.label} (${preset.start} → ${preset.end})`} />
          <div className="flex flex-wrap items-end gap-3">
            <Button variant={custom ? "default" : "outline"} size="sm" onClick={() => setCustom(!custom)}>
              {custom ? "Using custom range" : "Use custom range"}
            </Button>
            {custom && (
              <>
                <div><Label>From</Label><Input type="date" value={cStart} onChange={(e) => setCStart(e.target.value)} /></div>
                <div><Label>To</Label><Input type="date" value={cEnd} onChange={(e) => setCEnd(e.target.value)} /></div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <div id="full-report" className="space-y-4">
        <div className="text-center border-b border-border pb-3">
          <div className="font-bold text-primary text-lg">{church.name}</div>
          <div className="font-semibold mt-1">FINANCIAL REPORT — {label} ({start} to {end})</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-md border border-border p-3"><div className="text-xs text-muted-foreground">Total income</div><div className="font-semibold text-primary">{formatCurrency(income)}</div></div>
          <div className="rounded-md border border-border p-3"><div className="text-xs text-muted-foreground">Total expenses</div><div className="font-semibold text-destructive">{formatCurrency(spend)}</div></div>
          <div className="rounded-md border border-border p-3"><div className="text-xs text-muted-foreground">Conference share</div><div className="font-semibold">{formatCurrency(conf)}</div></div>
          <div className="rounded-md border border-border p-3"><div className="text-xs text-muted-foreground">Net</div><div className="font-semibold">{formatCurrency(income - spend)}</div></div>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Fund summary</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-4">Fund</th><th className="py-2 pr-4 text-right">Collected</th><th className="py-2 pr-4 text-right">Conference</th><th className="py-2 pr-4 text-right">Local</th></tr></thead>
              <tbody>
                {byFund.map((f) => (
                  <tr key={f.fund} className="border-t border-border">
                    <td className="py-2 pr-4">{FUND_LABELS[f.fund] ?? f.fund}</td>
                    <td className="py-2 pr-4 text-right">{formatCurrency(f.total)}</td>
                    <td className="py-2 pr-4 text-right">{formatCurrency(f.conf)}</td>
                    <td className="py-2 pr-4 text-right">{formatCurrency(f.local)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Department summary</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-4">Department</th><th className="py-2 pr-4 text-right">Contributions</th><th className="py-2 pr-4 text-right">Expenses</th><th className="py-2 pr-4 text-right">Net</th></tr></thead>
              <tbody>
                {byDept.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No activity.</td></tr>}
                {byDept.map((d) => (
                  <tr key={d.name} className="border-t border-border">
                    <td className="py-2 pr-4">{d.name}</td>
                    <td className="py-2 pr-4 text-right">{formatCurrency(d.given)}</td>
                    <td className="py-2 pr-4 text-right">{formatCurrency(d.spent)}</td>
                    <td className="py-2 pr-4 text-right">{formatCurrency(d.given - d.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Receipts</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Receipt #</th><th className="py-2 pr-4">Member</th><th className="py-2 pr-4">Category</th><th className="py-2 pr-4">Department</th><th className="py-2 pr-4 text-right">Amount</th></tr></thead>
              <tbody>
                {receipts.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No receipts.</td></tr>}
                {receipts.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1 pr-4">{r.transaction_date}</td>
                    <td className="py-1 pr-4 font-mono">{r.receipt_number}</td>
                    <td className="py-1 pr-4">{r.member_name ?? "—"}</td>
                    <td className="py-1 pr-4">{r.offering_categories?.name ?? "—"}</td>
                    <td className="py-1 pr-4">{r.departments?.name ?? "—"}</td>
                    <td className="py-1 pr-4 text-right">{formatCurrency(Number(r.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Expenses</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Category</th><th className="py-2 pr-4">Department</th><th className="py-2 pr-4">Vendor</th><th className="py-2 pr-4">Description</th><th className="py-2 pr-4 text-right">Amount</th></tr></thead>
              <tbody>
                {expenses.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No expenses.</td></tr>}
                {expenses.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1 pr-4">{r.transaction_date}</td>
                    <td className="py-1 pr-4">{r.expense_categories?.name ?? "—"}</td>
                    <td className="py-1 pr-4">{r.departments?.name ?? "—"}</td>
                    <td className="py-1 pr-4">{r.vendor ?? "—"}</td>
                    <td className="py-1 pr-4">{r.description ?? "—"}</td>
                    <td className="py-1 pr-4 text-right">{formatCurrency(Number(r.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
