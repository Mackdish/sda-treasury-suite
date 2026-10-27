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
import { printElement } from "@/lib/print";
import { Printer, Send } from "lucide-react";

export function RemittancePage() {
  const { data: church } = useCurrentChurch();
  const qc = useQueryClient();
  const now = new Date();
  const [start, setStart] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
  const [end, setEnd] = useState(now.toISOString().slice(0, 10));
  const [cash, setCash] = useState("0");
  const [bank, setBank] = useState("0");
  const [mpesa, setMpesa] = useState("0");
  const [cheque, setCheque] = useState("0");
  const [bankName, setBankName] = useState("");
  const [ref, setRef] = useState("");

  const { data: rows = [] } = useQuery({
    queryKey: ["remit-src", church?.id, start, end],
    enabled: !!church,
    queryFn: async () => {
      const { data } = await supabase
        .from("receipts")
        .select("amount,offering_categories!inner(name,fund_type,conference_split_pct)")
        .neq("approval_status", "deleted")
        .eq("church_id", church!.id)
        .eq("offering_categories.fund_type", "trust")
        .gte("transaction_date", start).lte("transaction_date", end);
      return (data ?? []) as any[];
    },
  });

  const { data: past = [] } = useQuery({
    queryKey: ["remit-list", church?.id],
    enabled: !!church,
    queryFn: async () => {
      const { data } = await supabase.from("remittances").select("*").eq("church_id", church!.id).order("remittance_date", { ascending: false }).limit(20);
      return (data ?? []) as any[];
    },
  });

  const breakdown = useMemo(() => {
    const m = new Map<string, number>();
    let confTotal = 0;
    rows.forEach((r) => {
      const amt = Number(r.amount);
      const share = amt * Number(r.offering_categories?.conference_split_pct ?? 0) / 100;
      const name = r.offering_categories?.name ?? "Other";
      m.set(name, (m.get(name) ?? 0) + share);
      confTotal += share;
    });
    return { rows: Array.from(m.entries()), total: confTotal };
  }, [rows]);

  const totalRemit = Number(cash) + Number(bank) + Number(mpesa) + Number(cheque);

  const save = useMutation({
    mutationFn: async () => {
      if (!church) throw new Error("No church");
      if (totalRemit <= 0) throw new Error("Enter at least one amount");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("remittances").insert({
        church_id: church.id,
        remittance_date: end,
        cash_amount: Number(cash),
        bank_amount: Number(bank),
        mpesa_amount: Number(mpesa),
        cheque_amount: Number(cheque),
        bank_name: bankName || null,
        reference_number: ref || null,
        breakdown: Object.fromEntries(breakdown.rows),
        status: "submitted",
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Remittance recorded"); qc.invalidateQueries({ queryKey: ["remit-list"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!church) return <><PageHeader title="Remittance" /><NoChurch /></>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conference Remittance"
        description="Submit trust funds to the conference with a printable remittance slip."
        actions={
          <>
            <Button variant="outline" onClick={() => printElement("remit-print", "Conference Remittance")}><Printer className="h-4 w-4 mr-1" /> Print</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}><Send className="h-4 w-4 mr-1" /> {save.isPending ? "Saving…" : "Record remittance"}</Button>
          </>
        }
      />
      <Card className="no-print">
        <CardHeader><CardTitle className="text-base">Period & payment</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div><Label>From</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label>To</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <div><Label>Bank name</Label><Input value={bankName} onChange={(e) => setBankName(e.target.value)} /></div>
          <div><Label>Reference / slip #</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} /></div>
          <div><Label>Cash</Label><Input type="number" value={cash} onChange={(e) => setCash(e.target.value)} /></div>
          <div><Label>Bank transfer</Label><Input type="number" value={bank} onChange={(e) => setBank(e.target.value)} /></div>
          <div><Label>M-Pesa</Label><Input type="number" value={mpesa} onChange={(e) => setMpesa(e.target.value)} /></div>
          <div><Label>Cheque</Label><Input type="number" value={cheque} onChange={(e) => setCheque(e.target.value)} /></div>
        </CardContent>
      </Card>
      <div id="remit-print" className="bg-card border border-border rounded-md p-6 space-y-3">
        <div className="text-center border-b border-border pb-3">
          <div className="font-bold text-primary text-lg">{church.name}</div>
          <div className="font-semibold mt-1">CONFERENCE REMITTANCE SLIP</div>
          <div className="text-xs">Period: {start} to {end}</div>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-left"><th className="py-1">Trust offering</th><th className="text-right">Conference share</th></tr></thead>
          <tbody>
            {breakdown.rows.length === 0 && <tr><td colSpan={2} className="py-4 text-center text-muted-foreground">No trust offerings for this period.</td></tr>}
            {breakdown.rows.map(([n, v]) => <tr key={n} className="border-t border-border"><td className="py-1">{n}</td><td className="text-right">{formatCurrency(v)}</td></tr>)}
            <tr className="border-t-2 border-primary font-semibold"><td className="py-2">Total due</td><td className="text-right">{formatCurrency(breakdown.total)}</td></tr>
            <tr><td className="py-1">Cash</td><td className="text-right">{formatCurrency(Number(cash))}</td></tr>
            <tr><td className="py-1">Bank</td><td className="text-right">{formatCurrency(Number(bank))}</td></tr>
            <tr><td className="py-1">M-Pesa</td><td className="text-right">{formatCurrency(Number(mpesa))}</td></tr>
            <tr><td className="py-1">Cheque</td><td className="text-right">{formatCurrency(Number(cheque))}</td></tr>
            <tr className="border-t-2 border-primary font-semibold"><td className="py-2">Total remitted</td><td className="text-right">{formatCurrency(totalRemit)}</td></tr>
          </tbody>
        </table>
        <div className="grid grid-cols-2 gap-4 pt-6 text-xs">
          <div>____________________<br/>Treasurer: {church.treasurer_name ?? ""}</div>
          <div className="text-right">____________________<br/>Received by (Conference)</div>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent remittances</CardTitle></CardHeader>
        <CardContent>
          {past.length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">None yet.</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Bank</th><th className="py-2 pr-4">Ref</th><th className="py-2 pr-4 text-right">Total</th></tr></thead>
                <tbody>
                  {past.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-2 pr-4">{r.remittance_date}</td>
                      <td className="py-2 pr-4">{r.bank_name ?? "—"}</td>
                      <td className="py-2 pr-4 font-mono">{r.reference_number ?? "—"}</td>
                      <td className="py-2 pr-4 text-right">{formatCurrency(Number(r.cash_amount) + Number(r.bank_amount) + Number(r.mpesa_amount) + Number(r.cheque_amount))}</td>
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