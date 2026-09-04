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
import { Printer, FileDown, Eye, FileSpreadsheet } from "lucide-react";
import { printElement } from "@/lib/print";
import { SignaturePad } from "@/components/signature-pad";
import { splitReceipts, FUND_LABEL } from "@/lib/funds";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

type ReceiptRow = {
  amount: number;
  offering_categories: {
    name: string;
    fund_type: string | null;
    conference_split_pct: number | null;
  } | null;
};

type ExpenseRow = {
  amount: number;
  transaction_date: string;
  description: string | null;
  expense_categories: { name: string } | null;
};

export function CashStatementPage() {
  const { data: church } = useCurrentChurch();
  const [start, setStart] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); });
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [sigTreasurer, setSigTreasurer] = useState<string | null>(null);
  const [sigElder, setSigElder] = useState<string | null>(null);
  const [sigPastor, setSigPastor] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["cash-statement", church?.id, start, end],
    enabled: !!church,
    queryFn: async () => {
      const [rc, ex] = await Promise.all([
        supabase.from("receipts")
          .select("amount,offering_categories(name,fund_type,conference_split_pct)")
          .eq("church_id", church!.id).gte("transaction_date", start).lte("transaction_date", end),
        supabase.from("expenses")
          .select("amount,transaction_date,description,expense_categories(name)")
          .eq("church_id", church!.id).gte("transaction_date", start).lte("transaction_date", end)
          .order("transaction_date", { ascending: true }),
      ]);
      return { receipts: (rc.data ?? []) as unknown as ReceiptRow[], expenses: (ex.data ?? []) as unknown as ExpenseRow[] };
    },
  });

  const view = useMemo(() => {
    const receipts = data?.receipts ?? [];
    const expenses = data?.expenses ?? [];
    const split = splitReceipts(receipts);
    const totalExpenses = expenses.reduce((s, x) => s + Number(x.amount), 0);
    const net = split.total - totalExpenses;

    return {
      categories: split.categories,
      totalReceipts: split.total,
      trust: split.trust,
      local: split.local,
      camp: split.camp,
      balanced: split.balanced,
      difference: split.difference,
      expenses,
      totalExpenses,
      net,
    };
  }, [data]);

  if (!church) return <><PageHeader title="Cash Statement" /><NoChurch /></>;

  const pdfInput = () => ({
      churchName: church.name,
      location: [church.address, church.city].filter(Boolean).join(", "),
      start,
      end,
      categories: view.categories.map((c) => ({
        name: c.name,
        fund: FUND_LABEL[c.fundType],
        splitPct: c.splitPct,
        amount: c.amount,
        trust: c.trust,
        local: c.local,
      })),
      totalReceipts: view.totalReceipts,
      trust: view.trust,
      local: view.local,
      camp: view.camp,
      balanced: view.balanced,
      expenses: view.expenses.map((e) => ({
        date: e.transaction_date,
        description: e.description ?? "",
        category: e.expense_categories?.name ?? "Other",
        amount: Number(e.amount),
      })),
      totalExpenses: view.totalExpenses,
      net: view.net,
      signatures: {
        treasurer: sigTreasurer,
        elder: sigElder,
        pastor: sigPastor,
        treasurerName: church.treasurer_name,
        elderName: church.elder_name,
        pastorName: church.pastor_name,
      },
  });

  // Heavy export libraries are loaded on demand so the page itself stays fast.
  const buildPdf = async () => {
    const { generateCashStatementPdf } = await import("@/lib/cash-statement-pdf");
    return generateCashStatementPdf(pdfInput());
  };

  const fileBase = () =>
    `Cash_Statement_${church.name.replace(/[^a-z0-9]+/gi, "_")}_${start}_to_${end}`;

  const downloadPdf = async () => {
    const doc = await buildPdf();
    doc.save(`${fileBase()}.pdf`);
  };

  const downloadExcel = async () => {
    const [XLSX, { generateCashStatementWorkbook }] = await Promise.all([
      import("xlsx"),
      import("@/lib/cash-statement-xlsx"),
    ]);
    XLSX.writeFile(generateCashStatementWorkbook(pdfInput()), `${fileBase()}.xlsx`);
  };

  const openPreview = async () => {
    setPreviewOpen(true);
    setPreviewUrl(null);
    const doc = await buildPdf();
    setPreviewUrl(doc.output("dataurlstring"));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Statement"
        description="SDA Church Treasurer's Cash Statement."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={openPreview}><Eye className="h-4 w-4 mr-1" /> Print preview</Button>
            <Button variant="outline" onClick={() => printElement("cash-statement", "Cash Statement")}><Printer className="h-4 w-4 mr-1" /> Print</Button>
            <Button variant="outline" onClick={downloadExcel}><FileSpreadsheet className="h-4 w-4 mr-1" /> Excel</Button>
            <Button onClick={downloadPdf}><FileDown className="h-4 w-4 mr-1" /> Download PDF</Button>
          </div>
        }
      />
      <Card className="no-print">
        <CardHeader><CardTitle className="text-base">Period</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div><Label>Start date</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label>End date</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card className="no-print">
        <CardHeader>
          <CardTitle className="text-base">Signatures</CardTitle>
          <p className="text-xs text-muted-foreground">Sign below — signatures will be embedded in the printed statement and PDF.</p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <SignaturePad label={`Treasurer${church.treasurer_name ? ` — ${church.treasurer_name}` : ""}`} value={sigTreasurer} onChange={setSigTreasurer} />
          <SignaturePad label={`Head Elder${church.elder_name ? ` — ${church.elder_name}` : ""}`} value={sigElder} onChange={setSigElder} />
          <SignaturePad label={`Pastor${church.pastor_name ? ` — ${church.pastor_name}` : ""}`} value={sigPastor} onChange={setSigPastor} />
        </CardContent>
      </Card>

      <div id="cash-statement" className="space-y-6 bg-card p-6 rounded-md border border-border">
        <div className="text-center border-b border-border pb-3">
          <div className="font-bold text-primary text-xl uppercase">{church.name}</div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {[church.address, church.city].filter(Boolean).join(" · ")}
          </div>
          <div className="font-semibold mt-2 text-base">Treasurer's Cash Statement</div>
          <div className="text-xs mt-1">PERIOD: {start} TO {end}</div>
        </div>

        {/* Part A — Receipts */}
        <section>
          <h3 className="font-semibold text-sm mb-2">Part A — Receipts (Income)</h3>
          <table className="w-full text-sm border border-border">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 border-b border-border">CATEGORY</th>
                <th className="text-left p-2 border-b border-border">FUND</th>
                <th className="text-left p-2 border-b border-border">SPLIT</th>
                <th className="text-right p-2 border-b border-border">AMOUNT (KES)</th>
                <th className="text-right p-2 border-b border-border">TRUST/CONF</th>
                <th className="text-right p-2 border-b border-border">LOCAL</th>
              </tr>
            </thead>
            <tbody>
              {view.categories.length === 0 ? (
                <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">No receipts in this period</td></tr>
              ) : view.categories.map((c, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="p-2">{c.name}</td>
                  <td className="p-2">{FUND_LABEL[c.fundType]}</td>
                  <td className="p-2">{c.splitPct}% / {100 - c.splitPct}%</td>
                  <td className="p-2 text-right">{formatCurrency(c.amount).replace(/^KES\s*/, "")}</td>
                  <td className="p-2 text-right">{formatCurrency(c.trust).replace(/^KES\s*/, "")}</td>
                  <td className="p-2 text-right">{formatCurrency(c.local).replace(/^KES\s*/, "")}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold bg-muted/40">
                <td className="p-2" colSpan={3}>Total Receipts</td>
                <td className="p-2 text-right">{formatCurrency(view.totalReceipts).replace(/^KES\s*/, "")}</td>
                <td className="p-2 text-right">{formatCurrency(view.trust).replace(/^KES\s*/, "")}</td>
                <td className="p-2 text-right">{formatCurrency(view.local + view.camp).replace(/^KES\s*/, "")}</td>
              </tr>
            </tfoot>
          </table>
          <p className="text-xs text-muted-foreground mt-2">
            Trust / Conference: Tithe 100%, 13th Sabbath 100%, Combined Offering 50%, Camp Goal 50%, Thanksgiving 50%,
            First Fruit 50%, Special Offering 50%. Local church: the matching 50% halves plus Camp Expense 100%,
            Development 100%, Camp Food 100%.
          </p>
        </section>

        {/* Part B — Fund Summary */}
        <section>
          <h3 className="font-semibold text-sm mb-2">Part B — Fund Summary</h3>
          <table className="w-full text-sm border border-border">
            <tbody>
              <tr className="border-b border-border">
                <td className="p-2">Trust Fund — remitted to Conference</td>
                <td className="p-2 text-right">{formatCurrency(view.trust).replace(/^KES\s*/, "")}</td>
              </tr>
              <tr className="border-b border-border">
                <td className="p-2">Local Church Fund</td>
                <td className="p-2 text-right">{formatCurrency(view.local).replace(/^KES\s*/, "")}</td>
              </tr>
              <tr className="border-b border-border">
                <td className="p-2">Camp Expense Fund</td>
                <td className="p-2 text-right">{formatCurrency(view.camp).replace(/^KES\s*/, "")}</td>
              </tr>
              <tr className="font-semibold bg-muted/40">
                <td className="p-2">
                  TOTAL{" "}
                  <span className={view.balanced ? "text-primary" : "text-destructive"}>
                    {view.balanced
                      ? "(balances with Total Receipts)"
                      : `(out of balance by ${formatCurrency(view.difference)})`}
                  </span>
                </td>
                <td className="p-2 text-right">
                  {formatCurrency(view.trust + view.local + view.camp).replace(/^KES\s*/, "")}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Part C — Expenses */}
        <section>
          <h3 className="font-semibold text-sm mb-2">Part C — Expenses</h3>
          <table className="w-full text-sm border border-border">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 border-b border-border">DATE</th>
                <th className="text-left p-2 border-b border-border">DESCRIPTION</th>
                <th className="text-left p-2 border-b border-border">CATEGORY</th>
                <th className="text-right p-2 border-b border-border">AMOUNT (KES)</th>
              </tr>
            </thead>
            <tbody>
              {view.expenses.length === 0 ? (
                <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">No expenses in this period</td></tr>
              ) : view.expenses.map((e, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="p-2">{e.transaction_date}</td>
                  <td className="p-2">{e.description ?? ""}</td>
                  <td className="p-2">{e.expense_categories?.name ?? "Other"}</td>
                  <td className="p-2 text-right">{formatCurrency(Number(e.amount)).replace(/^KES\s*/, "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between mt-2 font-semibold text-sm">
            <span>Total Expenses</span>
            <span>{formatCurrency(view.totalExpenses)}</span>
          </div>
        </section>

        {/* Net Balance */}
        <section className="border-t border-b border-border py-3">
          <div className="flex justify-between items-center font-bold text-base">
            <span>NET BALANCE FOR PERIOD</span>
            <span className={view.net >= 0 ? "text-primary" : "text-destructive"}>{formatCurrency(view.net)}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Receipts: {formatCurrency(view.totalReceipts).replace(/^KES\s*/, "")} · Expenses: {formatCurrency(view.totalExpenses).replace(/^KES\s*/, "")}
          </div>
        </section>

        {/* Signatures */}
        <div className="grid grid-cols-3 gap-6 pt-10 text-xs">
          {[
            { img: sigTreasurer, role: "TREASURER", name: church.treasurer_name },
            { img: sigElder, role: "HEAD ELDER", name: church.elder_name },
            { img: sigPastor, role: "PASTOR", name: church.pastor_name },
          ].map((s, i) => (
            <div key={i} className="text-center">
              <div className="h-10 flex items-end justify-center">
                {s.img ? <img src={s.img} alt={s.role} className="h-10 object-contain" /> : null}
              </div>
              <div className="border-t border-foreground pt-1">{s.role}</div>
              <div className="text-muted-foreground mt-1">{s.name ?? ""}</div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>Print preview</DialogTitle></DialogHeader>
          <iframe
            title="Cash statement PDF preview"
            className="w-full h-[75vh] rounded border border-border bg-white"
            src={previewOpen && previewUrl ? previewUrl : "about:blank"}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
            <Button onClick={downloadPdf}><FileDown className="h-4 w-4 mr-1" /> Download PDF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}