import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyReceipt } from "@/lib/receipts.functions";
import { receiptSlipHtml } from "@/lib/receipt-slip";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { printElement } from "@/lib/print";
import { Printer, Download } from "lucide-react";

type Row = {
  id: string;
  receipt_number: string;
  transaction_date: string;
  amount: number;
  payment_method: string;
  description: string | null;
  category: string;
  fund: string;
};

export function MyGivingPage() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const fetchReceipt = useServerFn(getMyReceipt);

  async function downloadReceipt(id: string) {
    try {
      const slip = await fetchReceipt({ data: { receiptId: id } });
      const w = window.open("", "_blank", "width=800,height=620");
      if (!w) return;
      w.document.write(receiptSlipHtml(slip));
      w.document.close();
      w.focus();
      setTimeout(() => { w.print(); }, 350);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not download this receipt");
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["my-giving", year],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return { name: "", rows: [] as Row[] };

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, member_id")
        .eq("id", uid)
        .maybeSingle();

      if (!profile?.member_id) return { name: profile?.full_name ?? "", rows: [] as Row[] };

      const { data: receipts } = await supabase
        .from("receipts")
        .select("id,receipt_number,transaction_date,amount,payment_method,description,offering_categories(name,fund_type)")
        .neq("approval_status", "deleted")
        .eq("member_id", profile.member_id)
        .gte("transaction_date", `${year}-01-01`)
        .lte("transaction_date", `${year}-12-31`)
        .order("transaction_date", { ascending: false });

      const rows: Row[] = (receipts ?? []).map((r: any) => ({
        id: r.id,
        receipt_number: r.receipt_number,
        transaction_date: r.transaction_date,
        amount: Number(r.amount ?? 0),
        payment_method: r.payment_method,
        description: r.description,
        category: r.offering_categories?.name ?? "—",
        fund: r.offering_categories?.fund_type ?? "—",
      }));
      return { name: profile.full_name ?? "", rows };
    },
  });

  const rows = data?.rows ?? [];
  const total = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.category, (m.get(r.category) ?? 0) + r.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  function downloadCsv() {
    const head = ["Receipt", "Date", "Category", "Fund", "Method", "Amount"];
    const body = rows.map((r) => [r.receipt_number, r.transaction_date, r.category, r.fund, r.payment_method, r.amount]);
    const csv = [head, ...body].map((l) => l.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-contributions-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My contributions"
        description="Your giving history and downloadable receipts."
        actions={
          <>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="Year"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <Button variant="secondary" size="sm" onClick={downloadCsv}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={() => printElement("my-giving-statement", "My contributions")}>
              <Printer className="h-4 w-4 mr-1" /> Print / PDF
            </Button>
          </>
        }
      />

      <div id="my-giving-statement" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {data?.name || "Member"} — {year} giving statement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-2xl font-bold text-primary">{formatCurrency(total)}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="py-2 pr-4">Category</th><th className="py-2 pr-4 text-right">Amount</th></tr>
                </thead>
                <tbody>
                  {byCategory.map(([c, amt]) => (
                    <tr key={c} className="border-t border-border">
                      <td className="py-1 pr-4">{c}</td>
                      <td className="py-1 pr-4 text-right">{formatCurrency(amt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Receipts</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No receipts recorded for {year}. If you expect entries here, ask your treasurer to link your
                account to your member record.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-4">Receipt</th>
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 pr-4">Category</th>
                      <th className="py-2 pr-4">Method</th>
                      <th className="py-2 pr-4 text-right">Amount</th>
                      <th className="no-print"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="py-1 pr-4 font-mono text-xs">{r.receipt_number}</td>
                        <td className="py-1 pr-4">{formatDate(r.transaction_date)}</td>
                        <td className="py-1 pr-4">{r.category}</td>
                        <td className="py-1 pr-4 capitalize">{r.payment_method.replace("_", " ")}</td>
                        <td className="py-1 pr-4 text-right">{formatCurrency(r.amount)}</td>
                        <td className="text-right no-print">
                          <Button size="sm" variant="ghost" onClick={() => downloadReceipt(r.id)}>
                            <Download className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
