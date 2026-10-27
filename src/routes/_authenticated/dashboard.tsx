import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { formatCurrency } from "@/lib/format";
import {
  Coins, Landmark, Wallet, Send, Building2, Receipt, FileSpreadsheet, BarChart3, Plus, Printer,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid,
} from "recharts";
import { useUserRoles, canAccess } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SDA Treasurer" }] }),
  component: Dashboard,
});

type Kpis = {
  todayTotal: number;
  monthTotal: number;
  trust: number;
  local: number;
  expenses: number;
  balance: number;
  monthly: { month: string; income: number; expenses: number }[];
  byCategory: { name: string; value: number }[];
  recent: { id: string; receipt_number: string; member_name: string | null; amount: number; transaction_date: string }[];
};

async function loadKpis(): Promise<Kpis> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);

  const [receiptsRes, expensesRes, recentRes] = await Promise.all([
    supabase
      .from("receipts")
      .select("id, amount, transaction_date, offering_category_id, offering_categories(name, fund_type)")
      .neq("approval_status", "deleted")
      .gte("transaction_date", yearStart),
    supabase.from("expenses").select("amount, transaction_date").gte("transaction_date", yearStart),
    supabase
      .from("receipts")
      .select("id, receipt_number, member_name, amount, transaction_date")
      .neq("approval_status", "deleted")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const rows = (receiptsRes.data ?? []) as any[];
  const expRows = (expensesRes.data ?? []) as any[];

  const todayTotal = rows.filter((r) => r.transaction_date >= dayStart).reduce((s, r) => s + Number(r.amount), 0);
  const monthTotal = rows.filter((r) => r.transaction_date >= monthStart).reduce((s, r) => s + Number(r.amount), 0);
  const trust = rows.filter((r) => r.offering_categories?.fund_type === "trust").reduce((s, r) => s + Number(r.amount), 0);
  const local = rows.filter((r) => r.offering_categories?.fund_type === "local").reduce((s, r) => s + Number(r.amount), 0);
  const expenses = expRows.reduce((s, r) => s + Number(r.amount), 0);
  const balance = trust + local - expenses;

  const monthly = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const start = d.toISOString().slice(0, 10);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10);
    const income = rows.filter((r) => r.transaction_date >= start && r.transaction_date < end).reduce((s, r) => s + Number(r.amount), 0);
    const ex = expRows.filter((r) => r.transaction_date >= start && r.transaction_date < end).reduce((s, r) => s + Number(r.amount), 0);
    return { month: d.toLocaleString(undefined, { month: "short" }), income, expenses: ex };
  });

  const catMap = new Map<string, number>();
  rows.forEach((r) => {
    const n = r.offering_categories?.name ?? "Other";
    catMap.set(n, (catMap.get(n) ?? 0) + Number(r.amount));
  });
  const byCategory = Array.from(catMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return { todayTotal, monthTotal, trust, local, expenses, balance, monthly, byCategory, recent: (recentRes.data ?? []) as any };
}

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];

function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: loadKpis });
  const k = data;
  const { data: roles } = useUserRoles();
  const userRoles = roles ?? [];

  const kpis = [
    { label: "Today's Collections", value: k?.todayTotal ?? 0, icon: Receipt, tint: "bg-primary/10 text-primary" },
    { label: "This Month", value: k?.monthTotal ?? 0, icon: BarChart3, tint: "bg-success/10 text-success" },
    { label: "Trust Funds (YTD)", value: k?.trust ?? 0, icon: Coins, tint: "bg-gold/20 text-gold-foreground" },
    { label: "Local Church Funds (YTD)", value: k?.local ?? 0, icon: Landmark, tint: "bg-secondary text-secondary-foreground" },
    { label: "Expenses (YTD)", value: k?.expenses ?? 0, icon: Wallet, tint: "bg-destructive/10 text-destructive" },
    { label: "Available Balance", value: k?.balance ?? 0, icon: Building2, tint: "bg-primary/10 text-primary" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Real-time overview of your church's cash flow.</p>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          {canAccess("/receipts", userRoles) && (
            <Button asChild><Link to="/receipts"><Plus className="h-4 w-4 mr-1" /> New Receipt</Link></Button>
          )}
          {canAccess("/cash-statement", userRoles) && (
            <Button asChild variant="secondary"><Link to="/cash-statement"><FileSpreadsheet className="h-4 w-4 mr-1" /> Cash Statement</Link></Button>
          )}
          {canAccess("/expenses", userRoles) && (
            <Button asChild variant="secondary"><Link to="/expenses"><Wallet className="h-4 w-4 mr-1" /> Expense</Link></Button>
          )}
          {canAccess("/reports", userRoles) && (
            <Button asChild variant="outline"><Link to="/reports"><Printer className="h-4 w-4 mr-1" /> Reports</Link></Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <div className={`h-9 w-9 rounded-md grid place-items-center ${c.tint}`}>
                <c.icon className="h-5 w-5" />
              </div>
              <div className="mt-3 text-xs text-muted-foreground">{c.label}</div>
              <div className="text-lg font-semibold">{isLoading ? "—" : formatCurrency(c.value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Income vs Expenses — last 6 months</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={k?.monthly ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Bar dataKey="income" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Offering Distribution</CardTitle></CardHeader>
          <CardContent className="h-72">
            {(!k || k.byCategory.length === 0) ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">No offerings recorded yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={k.byCategory} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {k.byCategory.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Receipts</CardTitle></CardHeader>
        <CardContent>
          {(!k || k.recent.length === 0) ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No receipts yet. Start by creating your first receipt.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Receipt #</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Member</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {k.recent.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-2 pr-4 font-mono">{r.receipt_number}</td>
                      <td className="py-2 pr-4">{r.transaction_date}</td>
                      <td className="py-2 pr-4">{r.member_name ?? "—"}</td>
                      <td className="py-2 pr-4 text-right">{formatCurrency(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}