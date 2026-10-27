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

/** Payment-method to cash-count row mapping (matches the SDA paper form). */
const CASH_ROWS: { key: string; label: string; methods: string[] }[] = [
  { key: "cash", label: "Cash", methods: ["cash"] },
  { key: "cheque", label: "Cheque", methods: ["cheque"] },
  { key: "paybill", label: "Church Paybill a/c", methods: ["mpesa"] },
  { key: "bank", label: "Bank Deposit Slip", methods: ["bank_transfer", "bank_deposit"] },
];

/** Split a month into up to 5 Sabbath-based weeks (Sun–Sat buckets). */
function weekBuckets(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const buckets: { label: string; start: string; end: string }[] = [];
  let cursor = new Date(first);
  let idx = 1;
  while (cursor <= last && idx <= 5) {
    // week end = next Saturday or last day of month
    const day = cursor.getDay();
    const saturday = new Date(cursor);
    saturday.setDate(cursor.getDate() + (6 - day));
    const end = saturday > last ? last : saturday;
    buckets.push({
      label: `Week ${idx}`,
      start: cursor.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    });
    cursor = new Date(end);
    cursor.setDate(cursor.getDate() + 1);
    idx++;
  }
  return buckets;
}

export function WeeklyReportPage() {
  const { data: church } = useCurrentChurch();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [serial, setSerial] = useState("");
  const [sabbathSchool, setSabbathSchool] = useState("");

  const { data } = useQuery({
    queryKey: ["weekly-report", church?.id, year, month],
    enabled: !!church,
    queryFn: async () => {
      const s = new Date(year, month, 1).toISOString().slice(0, 10);
      const e = new Date(year, month + 1, 0).toISOString().slice(0, 10);
      const [rc, rem] = await Promise.all([
        supabase
          .from("receipts")
          .select("transaction_date,amount,payment_method,offering_categories(name,fund_type,conference_split_pct)")
          .neq("approval_status", "deleted")
          .eq("church_id", church!.id).gte("transaction_date", s).lte("transaction_date", e),
        supabase
          .from("remittances")
          .select("remittance_date,cash_amount,bank_amount,mpesa_amount,cheque_amount,bank_name,reference_number")
          .eq("church_id", church!.id).gte("remittance_date", s).lte("remittance_date", e)
          .order("remittance_date", { ascending: true }),
      ]);
      return { receipts: (rc.data ?? []) as any[], remittances: (rem.data ?? []) as any[] };
    },
  });
  const rows = data?.receipts ?? [];
  const remittances = data?.remittances ?? [];

  const weeks = useMemo(() => weekBuckets(year, month), [year, month]);

  /** Cash count summary: rows by payment method × week. */
  const cashCount = useMemo(() => {
    const grid = CASH_ROWS.map((r) => {
      const perWeek = weeks.map((w) =>
        rows
          .filter((x) => x.transaction_date >= w.start && x.transaction_date <= w.end && r.methods.includes(x.payment_method))
          .reduce((s, x) => s + Number(x.amount), 0),
      );
      return { label: r.label, perWeek, total: perWeek.reduce((s, n) => s + n, 0) };
    });
    const weekTotals = weeks.map((_, i) => grid.reduce((s, g) => s + g.perWeek[i], 0));
    const grand = weekTotals.reduce((s, n) => s + n, 0);
    return { grid, weekTotals, grand };
  }, [rows, weeks]);

  /** Offering summary: split each receipt into trust (conference) and local shares per its
   *  conference_split_pct. Categories with a partial split appear on BOTH sides. */
  const offerings = useMemo(() => {
    type Row = { cat: string; perWeek: number[]; total: number };
    const build = (side: "trust" | "local") => {
      const map = new Map<string, number[]>();
      rows.forEach((r) => {
        const cat = r.offering_categories?.name ?? "Other";
        const pct = Number(r.offering_categories?.conference_split_pct ?? 0);
        const share = side === "trust" ? pct / 100 : 1 - pct / 100;
        if (share <= 0) return;
        const amt = Number(r.amount) * share;
        const wIdx = weeks.findIndex((w) => r.transaction_date >= w.start && r.transaction_date <= w.end);
        if (wIdx < 0) return;
        const arr = map.get(cat) ?? weeks.map(() => 0);
        arr[wIdx] += amt;
        map.set(cat, arr);
      });
      const grid: Row[] = Array.from(map.entries()).map(([cat, perWeek]) => ({
        cat, perWeek, total: perWeek.reduce((s, n) => s + n, 0),
      })).sort((a, b) => b.total - a.total);
      const total = grid.reduce((s, g) => s + g.total, 0);
      return { grid, total };
    };
    const trust = build("trust");
    const local = build("local");
    return { trust, local, grand: trust.total + local.total };
  }, [rows, weeks]);

  if (!church) return <><PageHeader title="Weekly Report" /><NoChurch /></>;

  const conference = church.conference_id ? "Conference" : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly Cash Count & Offerings"
        description="Weeks 1–5 with automatic totals per offering category."
        actions={<Button onClick={() => printElement("weekly-report", "Weekly Report")}><Printer className="h-4 w-4 mr-1" /> Print</Button>}
      />
      <Card className="no-print">
        <CardHeader><CardTitle className="text-base">Period</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div>
            <Label>Month</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Year</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></div>
          <div><Label>Serial No.</Label><Input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="e.g. 1900" /></div>
          <div><Label>Sabbath School</Label><Input value={sabbathSchool} onChange={(e) => setSabbathSchool(e.target.value)} /></div>
        </CardContent>
      </Card>

      <PeriodFinalize
        table="weekly_reports"
        churchId={church.id}
        year={year}
        month={month}
        snapshot={{
          cashCount, offerings, serial, sabbathSchool,
          remittances: remittances.map((r) => ({
            date: r.remittance_date,
            amount: Number(r.cash_amount) + Number(r.bank_amount) + Number(r.mpesa_amount) + Number(r.cheque_amount),
            bank: r.bank_name, ref: r.reference_number,
          })),
        }}
        label="Weekly report"
      />

      <div id="weekly-report" className="bg-card border border-border rounded-md p-6 space-y-5 text-sm">
        {/* Header */}
        <div className="text-center border-b border-border pb-3">
          <div className="font-bold text-primary text-lg uppercase">Seventh-Day Adventist Church</div>
          <div className="text-xs uppercase tracking-wide">{church.address ?? ""}{church.city ? ` — ${church.city}` : ""}</div>
          <div className="font-semibold mt-2">CASH COUNT AND OFFERINGS REPORT SUMMARY</div>
          <div className="flex justify-between text-xs mt-3">
            <div><span className="font-semibold">Name of Church:</span> {church.name}</div>
            <div><span className="font-semibold">Serial No.:</span> <span className="text-destructive font-bold">{serial || "—"}</span></div>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <div><span className="font-semibold">Name of Sabbath School:</span> {sabbathSchool || "—"}</div>
            <div><span className="font-semibold">Name of District:</span> {conference || "—"}</div>
          </div>
          <div className="text-xs mt-1 text-left"><span className="font-semibold">Period:</span> {MONTHS[month]} {year}</div>
        </div>

        {/* Weekly Cash Count Summary */}
        <div>
          <div className="font-semibold text-center border border-border py-1 bg-muted/40">WEEKLY CASH COUNT SUMMARY</div>
          <table className="w-full border-collapse [&_td]:border [&_th]:border [&_td]:border-border [&_th]:border-border [&_td]:px-2 [&_th]:px-2 [&_td]:py-1 [&_th]:py-1">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left">[Date]:</th>
                {weeks.map((w) => <th key={w.label} className="text-right">{w.label}</th>)}
                {Array.from({ length: 5 - weeks.length }).map((_, i) => <th key={`e${i}`} className="text-right text-muted-foreground">Week {weeks.length + i + 1}</th>)}
                <th className="text-right">TOTALS</th>
              </tr>
            </thead>
            <tbody>
              {cashCount.grid.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  {r.perWeek.map((v, i) => <td key={i} className="text-right">{v ? formatCurrency(v) : ""}</td>)}
                  {Array.from({ length: 5 - weeks.length }).map((_, i) => <td key={`e${i}`} />)}
                  <td className="text-right font-medium">{formatCurrency(r.total)}</td>
                </tr>
              ))}
              <tr className="font-semibold bg-muted/20">
                <td>Total Received</td>
                {cashCount.weekTotals.map((v, i) => <td key={i} className="text-right">{v ? formatCurrency(v) : ""}</td>)}
                {Array.from({ length: 5 - weeks.length }).map((_, i) => <td key={`e${i}`} />)}
                <td className="text-right text-primary">{formatCurrency(cashCount.grand)}</td>
              </tr>
            </tbody>
          </table>
          <div className="grid grid-cols-3 gap-4 text-xs mt-2">
            <div>SIGNED BY: TREASURER<br/>_____________________<br/>{church.treasurer_name ?? ""}</div>
            <div>DEACON<br/>_____________________</div>
            <div>ELDER<br/>_____________________<br/>{church.elder_name ?? ""}</div>
          </div>
        </div>

        {/* Offering Summary */}
        <div>
          <div className="font-semibold text-center border border-border py-1 bg-muted/40">[OFFERING SUMMARY]</div>
          <div className="text-center italic text-xs py-1 border-x border-b border-border">Trust Funds — 100% Tithe · 50% Combined · 50% First Fruit remitted to Conference</div>
          <table className="w-full border-collapse [&_td]:border [&_th]:border [&_td]:border-border [&_th]:border-border [&_td]:px-2 [&_th]:px-2 [&_td]:py-1 [&_th]:py-1">
            <tbody>
              {offerings.trust.grid.length === 0 && (
                <tr><td colSpan={2} className="text-center text-muted-foreground py-3">No trust fund receipts.</td></tr>
              )}
              {offerings.trust.grid.map((g) => (
                <tr key={g.cat}>
                  <td>{g.cat}</td>
                  <td className="text-right">{formatCurrency(g.total)}</td>
                </tr>
              ))}
              <tr className="font-semibold bg-muted/20">
                <td>Total Trust Funds</td>
                <td className="text-right text-primary">{formatCurrency(offerings.trust.total)}</td>
              </tr>
            </tbody>
          </table>

          <div className="text-center italic text-xs py-1 border-x border-b border-border">Local Church Offering — 50% Combined · 50% First Fruit · 100% Others retained locally</div>
          <table className="w-full border-collapse [&_td]:border [&_th]:border [&_td]:border-border [&_th]:border-border [&_td]:px-2 [&_th]:px-2 [&_td]:py-1 [&_th]:py-1">
            <tbody>
              {offerings.local.grid.length === 0 && (
                <tr><td colSpan={2} className="text-center text-muted-foreground py-3">No local offerings.</td></tr>
              )}
              {offerings.local.grid.map((g) => (
                <tr key={g.cat}>
                  <td>{g.cat}</td>
                  <td className="text-right">{formatCurrency(g.total)}</td>
                </tr>
              ))}
              <tr className="font-semibold bg-muted/20">
                <td>Total Local Offering</td>
                <td className="text-right">{formatCurrency(offerings.local.total)}</td>
              </tr>
              <tr className="font-bold bg-muted/30">
                <td>Total Offering</td>
                <td className="text-right text-primary">{formatCurrency(offerings.grand)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Remittance */}
        <div>
          <div className="font-semibold text-xs mb-1">
            Total remittance to SDA Church {church.city ?? ""} Field KSH.{" "}
            <span className="text-primary">
              {formatCurrency(remittances.reduce((s, r) => s + Number(r.cash_amount) + Number(r.bank_amount) + Number(r.mpesa_amount) + Number(r.cheque_amount), 0))}
            </span>
          </div>
          <table className="w-full border-collapse [&_td]:border [&_th]:border [&_td]:border-border [&_th]:border-border [&_td]:px-2 [&_th]:px-2 [&_td]:py-1 [&_th]:py-1 text-xs">
            <thead className="bg-muted/30">
              <tr>
                <th className="w-10 text-left">Deposit slips</th>
                <th className="text-left">Date</th>
                <th className="text-right">Amount</th>
                <th className="text-left">Bank/Paybill</th>
                <th className="text-left">Mpesa transaction reference for paybill</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => {
                const r = remittances[i];
                const amt = r ? Number(r.cash_amount) + Number(r.bank_amount) + Number(r.mpesa_amount) + Number(r.cheque_amount) : 0;
                return (
                  <tr key={i}>
                    <td className="text-center">{i + 1}</td>
                    <td>{r?.remittance_date ?? ""}</td>
                    <td className="text-right">{r ? formatCurrency(amt) : ""}</td>
                    <td>{r?.bank_name ?? ""}</td>
                    <td>{r?.reference_number ?? ""}</td>
                  </tr>
                );
              })}
              <tr className="font-semibold bg-muted/20">
                <td colSpan={2}>Total</td>
                <td className="text-right">
                  {formatCurrency(remittances.reduce((s, r) => s + Number(r.cash_amount) + Number(r.bank_amount) + Number(r.mpesa_amount) + Number(r.cheque_amount), 0))}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>
          <p className="text-[10px] italic mt-1">
            NOTE: 1ST Copy to be sent to the Field Treasurer with remittance payment. Duplicate copy to be retained by church treasurer for audit.
          </p>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-6 pt-6 text-xs">
          <div>
            Signed [Church Pastor] [Name]: {church.pastor_name ?? "____________________"}<br/>
            [Signature] ____________________ [Date] __________
          </div>
          <div className="text-right">
            Presented by:<br/>
            Church Treasurer: {church.treasurer_name ?? "____________________"}<br/>
            Tel No.: {church.phone ?? "____________________"}
          </div>
        </div>
      </div>
    </div>
  );
}