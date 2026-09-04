import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentChurch } from "@/lib/church";
import { PageHeader, NoChurch } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { PeriodPicker } from "@/components/period-picker";
import { periodRange, downloadCsv, type PeriodKind } from "@/lib/periods";
import { printElement } from "@/lib/print";
import { Download, FileSpreadsheet, Printer, Search, Trophy } from "lucide-react";
import { memberRankHeader, memberRankBody } from "@/lib/member-contributions-xlsx";

type Row = {
  id: string; amount: number; transaction_date: string; member_id: string | null;
  member_name: string | null; membership_number: string | null;
  departments: { name: string } | null;
  offering_categories: { name: string; fund_type: string } | null;
};

export function MemberContributionsPage() {
  const { data: church } = useCurrentChurch();
  const [kind, setKind] = useState<PeriodKind>("annually");
  const [anchor, setAnchor] = useState(new Date().toISOString().slice(0, 10));
  const { start, end, label } = periodRange(kind, anchor);
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<string | null>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ["member-contrib", church?.id, start, end],
    enabled: !!church,
    queryFn: async () => {
      const { data } = await supabase
        .from("receipts")
        .select("id,amount,transaction_date,member_id,member_name,membership_number,departments(name),offering_categories(name,fund_type)")
        .eq("church_id", church!.id)
        .gte("transaction_date", start)
        .lte("transaction_date", end)
        .order("transaction_date", { ascending: false })
        .limit(3000);
      return (data ?? []) as unknown as Row[];
    },
  });

  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.offering_categories?.name ?? "Uncategorised"))).sort(),
    [rows],
  );

  const funds = useMemo(
    () => ["trust", "local", "camp"].filter((f) => rows.some((r) => r.offering_categories?.fund_type === f)),
    [rows],
  );
  const fundLabel: Record<string, string> = {
    trust: "Trust Fund",
    local: "Local Church Fund",
    camp: "Camp Expense Fund",
  };

  const ranked = useMemo(() => {
    const m = new Map<string, { key: string; name: string; number: string | null; department: string; total: number; count: number; byCat: Record<string, number>; byFund: Record<string, number> }>();
    rows.forEach((r) => {
      const key = r.member_id ?? `name:${(r.member_name ?? "Anonymous").toLowerCase()}`;
      const cur = m.get(key) ?? {
        key,
        name: r.member_name ?? "Anonymous",
        number: r.membership_number ?? null,
        department: r.departments?.name ?? "—",
        total: 0,
        count: 0,
        byCat: {},
        byFund: {},
      };
      const cat = r.offering_categories?.name ?? "Uncategorised";
      const fund = r.offering_categories?.fund_type ?? "local";
      cur.total += Number(r.amount);
      cur.count += 1;
      cur.byCat[cat] = (cur.byCat[cat] ?? 0) + Number(r.amount);
      cur.byFund[fund] = (cur.byFund[fund] ?? 0) + Number(r.amount);
      m.set(key, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [rows]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return ranked;
    return ranked.filter((r) => r.name.toLowerCase().includes(t) || (r.number ?? "").toLowerCase().includes(t));
  }, [ranked, q]);

  const focusMember = ranked.find((r) => r.key === focus) ?? null;
  const focusRows = useMemo(
    () => rows.filter((r) => (r.member_id ?? `name:${(r.member_name ?? "Anonymous").toLowerCase()}`) === focus),
    [rows, focus],
  );

  const grand = ranked.reduce((s, r) => s + r.total, 0);

  const exportInput = {
    churchName: church?.name ?? "",
    periodLabel: label,
    start,
    end,
    categories,
    funds,
    rows: ranked,
  };

  if (!church) return <><PageHeader title="Member Contributions" /><NoChurch /></>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Member Contributions"
        description="Ranked giving per member with a full breakdown by offering category."
        actions={
          <>
            <Button variant="outline" onClick={() => downloadCsv(`member_contributions_${start}_${end}.csv`, [
              memberRankHeader(exportInput),
              ...memberRankBody(exportInput),
            ])}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
            <Button variant="outline" onClick={async () => {
              const [XLSX, { generateMemberContributionsWorkbook }] = await Promise.all([
                import("xlsx"),
                import("@/lib/member-contributions-xlsx"),
              ]);
              XLSX.writeFile(
                generateMemberContributionsWorkbook(exportInput),
                `member_contributions_${start}_${end}.xlsx`,
              );
            }}><FileSpreadsheet className="h-4 w-4 mr-1" /> Excel</Button>
            <Button onClick={() => printElement("member-report", "Member Contributions")}><Printer className="h-4 w-4 mr-1" /> Print</Button>
          </>
        }
      />

      <Card className="no-print">
        <CardContent className="pt-6 space-y-3">
          <PeriodPicker kind={kind} anchor={anchor} onKind={setKind} onAnchor={setAnchor} label={`${label} (${start} → ${end})`} />
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search member…" className="pl-8" />
          </div>
        </CardContent>
      </Card>

      <div id="member-report" className="space-y-4">
        <div className="text-center border-b border-border pb-3">
          <div className="font-bold text-primary text-lg">{church.name}</div>
          <div className="font-semibold mt-1">MEMBER CONTRIBUTIONS — {label} ({start} to {end})</div>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4 text-accent-foreground" /> Ranking</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-4">Member</th>
                  <th className="py-2 pr-4">Membership #</th>
                  <th className="py-2 pr-4">Department</th>
                  <th className="py-2 pr-4 text-right">Receipts</th>
                  {funds.map((f) => <th key={f} className="py-2 pr-4 text-right">{fundLabel[f]}</th>)}
                  <th className="py-2 pr-4 text-right">Total given</th>
                  <th className="py-2 pr-4 text-right">Share</th>
                  <th className="py-2 pr-4 no-print"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={8 + funds.length} className="py-6 text-center text-muted-foreground">No contributions in this period.</td></tr>}
                {filtered.map((r) => {
                  const rank = ranked.findIndex((x) => x.key === r.key) + 1;
                  return (
                    <tr key={r.key} className="border-t border-border">
                      <td className="py-2 pr-3 font-mono">{rank}</td>
                      <td className="py-2 pr-4 font-medium">{r.name}</td>
                      <td className="py-2 pr-4">{r.number ?? "—"}</td>
                      <td className="py-2 pr-4">{r.department}</td>
                      <td className="py-2 pr-4 text-right">{r.count}</td>
                      {funds.map((f) => <td key={f} className="py-2 pr-4 text-right">{r.byFund[f] ? formatCurrency(r.byFund[f]) : "—"}</td>)}
                      <td className="py-2 pr-4 text-right">{formatCurrency(r.total)}</td>
                      <td className="py-2 pr-4 text-right">{grand ? ((r.total / grand) * 100).toFixed(1) : "0.0"}%</td>
                      <td className="py-2 pr-4 text-right no-print">
                        <Button size="sm" variant="ghost" onClick={() => setFocus(r.key)}>Statement</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td /><td className="py-2 pr-4">Total</td><td /><td /><td />
                  {funds.map((f) => (
                    <td key={f} className="py-2 pr-4 text-right">{formatCurrency(ranked.reduce((s, r) => s + (r.byFund[f] ?? 0), 0))}</td>
                  ))}
                  <td className="py-2 pr-4 text-right">{formatCurrency(grand)}</td><td /><td className="no-print" />
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Contributions by category</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Member</th>
                  {categories.map((c) => <th key={c} className="py-2 pr-4 text-right">{c}</th>)}
                  <th className="py-2 pr-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.key} className="border-t border-border">
                    <td className="py-1 pr-4">{r.name}</td>
                    {categories.map((c) => <td key={c} className="py-1 pr-4 text-right">{r.byCat[c] ? formatCurrency(r.byCat[c]) : "—"}</td>)}
                    <td className="py-1 pr-4 text-right font-medium">{formatCurrency(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="py-2 pr-4">Total</td>
                  {categories.map((c) => (
                    <td key={c} className="py-2 pr-4 text-right">{formatCurrency(ranked.reduce((s, r) => s + (r.byCat[c] ?? 0), 0))}</td>
                  ))}
                  <td className="py-2 pr-4 text-right">{formatCurrency(grand)}</td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>

        {focusMember && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{focusMember.name} — giving statement</CardTitle>
              <Button size="sm" variant="ghost" className="no-print" onClick={() => setFocus(null)}>Close</Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Category</th><th className="py-2 pr-4">Fund</th><th className="py-2 pr-4">Department</th><th className="py-2 pr-4 text-right">Amount</th></tr></thead>
                <tbody>
                  {focusRows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-1 pr-4">{r.transaction_date}</td>
                      <td className="py-1 pr-4">{r.offering_categories?.name ?? "—"}</td>
                      <td className="py-1 pr-4 capitalize">{r.offering_categories?.fund_type ?? "—"}</td>
                      <td className="py-1 pr-4">{r.departments?.name ?? "—"}</td>
                      <td className="py-1 pr-4 text-right">{formatCurrency(Number(r.amount))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="py-2 pr-4" colSpan={4}>Total</td>
                    <td className="py-2 pr-4 text-right">{formatCurrency(focusMember.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
