import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentChurch } from "@/lib/church";
import { PageHeader, NoChurch } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { printElement } from "@/lib/print";
import { Printer } from "lucide-react";
import { PeriodFinalize } from "@/components/period-finalize";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function MonthlyStatementPage() {
  const { data: church } = useCurrentChurch();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const s = new Date(year, month, 1).toISOString().slice(0, 10);
  const e = new Date(year, month + 1, 0).toISOString().slice(0, 10);

  const { data } = useQuery({
    queryKey: ["monthly", church?.id, year, month],
    enabled: !!church,
    queryFn: async () => {
      const [rc, ex] = await Promise.all([
        supabase.from("receipts").select("amount,offering_categories(name,fund_type,conference_split_pct)").neq("approval_status", "deleted").eq("church_id", church!.id).gte("transaction_date", s).lte("transaction_date", e),
        supabase.from("expenses").select("amount,expense_categories(name)").eq("church_id", church!.id).gte("transaction_date", s).lte("transaction_date", e),
      ]);
      return { r: (rc.data ?? []) as any[], ex: (ex.data ?? []) as any[] };
    },
  });

  const stats = useMemo(() => {
    const r = data?.r ?? [];
    const ex = data?.ex ?? [];
    const income = r.reduce((s, x) => s + Number(x.amount), 0);
    const spend = ex.reduce((s, x) => s + Number(x.amount), 0);
    const conf = r.reduce((s, x) => s + Number(x.amount) * Number(x.offering_categories?.conference_split_pct ?? 0) / 100, 0);
    const local = income - conf;
    const byCat = new Map<string, { total: number; conf: number; local: number; pct: number }>();
    r.forEach((x) => {
      const name = x.offering_categories?.name ?? "Other";
      const pct = Number(x.offering_categories?.conference_split_pct ?? 0);
      const amt = Number(x.amount);
      const cShare = amt * pct / 100;
      const cur = byCat.get(name) ?? { total: 0, conf: 0, local: 0, pct };
      cur.total += amt; cur.conf += cShare; cur.local += amt - cShare; cur.pct = pct;
      byCat.set(name, cur);
    });
    const byExp = new Map<string, number>();
    ex.forEach((x) => byExp.set(x.expense_categories?.name ?? "Other", (byExp.get(x.expense_categories?.name ?? "Other") ?? 0) + Number(x.amount)));
    return { income, spend, conf, local, byCat: Array.from(byCat.entries()), byExp: Array.from(byExp.entries()), net: income - spend };
  }, [data]);

  if (!church) return <><PageHeader title="Monthly Statement" /><NoChurch /></>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monthly Cash Statement"
        description="Monthly summary of income, expenses and fund splits."
        actions={<Button onClick={() => printElement("monthly-statement", "Monthly Statement")}><Printer className="h-4 w-4 mr-1" /> Print</Button>}
      />
      <Card className="no-print">
        <CardContent className="grid gap-3 md:grid-cols-4 pt-6">
          <div><Label>Month</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Year</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></div>
        </CardContent>
      </Card>

      <PeriodFinalize
        table="cash_statements"
        churchId={church.id}
        year={year}
        month={month}
        snapshot={{
          income: stats.income, spend: stats.spend, conf: stats.conf, local: stats.local,
          net: stats.net, byCat: stats.byCat, byExp: stats.byExp,
        }}
        label="Monthly statement"
      />
      <div id="monthly-statement" className="bg-card border border-border rounded-md p-6 space-y-4">
        <div className="text-center border-b border-border pb-3">
          <div className="font-bold text-primary text-lg">{church.name}</div>
          <div className="font-semibold mt-1">MONTHLY CASH STATEMENT — {MONTHS[month]} {year}</div>
          <div className="text-[11px] italic text-muted-foreground mt-1">
            Splits applied — Tithe 100% Conference · Combined Offering 50/50 · First Fruit 50/50 · All others 100% Local
          </div>
        </div>
        <div>
          <div className="font-semibold mb-2">Income by category</div>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-1 text-left">Category</th>
                <th className="py-1 text-right">Split</th>
                <th className="py-1 text-right">Total</th>
                <th className="py-1 text-right">Conference</th>
                <th className="py-1 text-right">Local</th>
              </tr>
            </thead>
            <tbody>
              {stats.byCat.length === 0 && <tr><td className="py-2 text-muted-foreground" colSpan={5}>No income.</td></tr>}
              {stats.byCat.map(([n, v]) => (
                <tr key={n} className="border-t border-border">
                  <td className="py-1">{n}</td>
                  <td className="py-1 text-right text-xs text-muted-foreground">{v.pct}% / {100 - v.pct}%</td>
                  <td className="py-1 text-right">{formatCurrency(v.total)}</td>
                  <td className="py-1 text-right">{formatCurrency(v.conf)}</td>
                  <td className="py-1 text-right">{formatCurrency(v.local)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-primary font-semibold">
                <td className="py-2" colSpan={2}>Total income</td>
                <td className="py-2 text-right">{formatCurrency(stats.income)}</td>
                <td className="py-2 text-right text-primary">{formatCurrency(stats.conf)}</td>
                <td className="py-2 text-right">{formatCurrency(stats.local)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
            <div className="font-semibold mb-2">Expenses by category</div>
            <table className="w-full text-sm">
              <tbody>
                {stats.byExp.length === 0 && <tr><td className="py-2 text-muted-foreground">No expenses.</td></tr>}
                {stats.byExp.map(([n, v]) => <tr key={n} className="border-t border-border"><td className="py-1">{n}</td><td className="text-right">{formatCurrency(v)}</td></tr>)}
                <tr className="border-t-2 border-primary font-semibold"><td className="py-2">Total expenses</td><td className="text-right">{formatCurrency(stats.spend)}</td></tr>
              </tbody>
            </table>
        </div>
        <div className="grid grid-cols-3 gap-4 border-t border-border pt-4 text-sm">
          <div><div className="text-xs text-muted-foreground">Conference share</div><div className="font-semibold text-primary">{formatCurrency(stats.conf)}</div></div>
          <div><div className="text-xs text-muted-foreground">Local church share</div><div className="font-semibold">{formatCurrency(stats.local)}</div></div>
          <div><div className="text-xs text-muted-foreground">Net for the month</div><div className="font-semibold">{formatCurrency(stats.net)}</div></div>
        </div>
      </div>
    </div>
  );
}