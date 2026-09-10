import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentChurch } from "@/lib/church";
import { PageHeader, NoChurch } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { Plus, Printer, Search, Receipt as ReceiptIcon, UserPlus, X } from "lucide-react";
import { printElement } from "@/lib/print";
import { LockRowActions, LockStatusBadge } from "@/components/lock-actions";
import { RecordActions } from "@/components/record-actions";

type Category = { id: string; name: string; fund_type: "trust" | "local" | "camp"; conference_split_pct: number };
type Department = { id: string; name: string };
type Member = { id: string; full_name: string; membership_number: string | null; phone: string | null; department: string | null };
type ReceiptRow = {
  id: string; receipt_number: string; transaction_date: string; member_name: string | null;
  membership_number: string | null; phone?: string | null; department_id?: string | null;
  amount: number; payment_method: string; reference_number?: string | null; description?: string | null;
  is_locked: boolean; reversed_at: string | null;
  approval_status: "draft" | "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  offering_categories: { name: string; fund_type: string } | null;
};

const PAY = ["cash", "mpesa", "bank_transfer", "cheque", "bank_deposit"] as const;

export function ReceiptsPage() {
  const { data: church } = useCurrentChurch();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [printing, setPrinting] = useState<ReceiptRow[] | null>(null);
  const [editing, setEditing] = useState<ReceiptRow | null>(null);

  const { data: cats = [] } = useQuery({
    queryKey: ["offering-cats", church?.id], enabled: !!church,
    queryFn: async () => {
      const { data } = await supabase.from("offering_categories").select("id,name,fund_type,conference_split_pct").eq("is_active", true).order("sort_order");
      return (data ?? []) as Category[];
    },
  });
  const { data: members = [] } = useQuery({
    queryKey: ["members", church?.id], enabled: !!church,
    queryFn: async () => {
      const { data } = await supabase.from("church_members").select("id,full_name,membership_number,phone,department").eq("church_id", church!.id).order("full_name");
      return (data ?? []) as Member[];
    },
  });
  const { data: departments = [] } = useQuery({
    queryKey: ["departments", church?.id], enabled: !!church,
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id,name").eq("church_id", church!.id).eq("is_active", true).order("sort_order");
      return (data ?? []) as Department[];
    },
  });
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["receipts", church?.id], enabled: !!church,
    queryFn: async () => {
      const { data } = await supabase.from("receipts")
        .select("id,receipt_number,transaction_date,member_name,membership_number,phone,department_id,amount,payment_method,reference_number,description,is_locked,reversed_at,approval_status,rejection_reason,offering_categories(name,fund_type)")
        .eq("church_id", church!.id).order("created_at", { ascending: false }).limit(500);
      return (data ?? []) as unknown as ReceiptRow[];
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => r.receipt_number.toLowerCase().includes(term) || (r.member_name ?? "").toLowerCase().includes(term) || (r.membership_number ?? "").toLowerCase().includes(term) || (r.reference_number ?? "").toLowerCase().includes(term) || (r.description ?? "").toLowerCase().includes(term) || (r.offering_categories?.name ?? "").toLowerCase().includes(term));
  }, [rows, q]);
  const total = filtered.reduce((s, r) => s + Number(r.amount || 0), 0);

  if (!church) return <><PageHeader title="Receipts" /><NoChurch /></>;

  return (
    <div className="space-y-6">
      <PageHeader title="Receipts" description="Sequentially numbered receipts for every offering and donation." actions={
        <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New Receipt</Button></DialogTrigger>
          <NewReceiptDialog church={church} categories={cats} members={members} departments={departments} onDone={(row) => { setOpen(false); qc.invalidateQueries({ queryKey: ["receipts"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); if (row?.length) setPrinting(row); }} />
        </Dialog>
      } />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2"><CardTitle className="text-base">All receipts · <span className="text-primary">{formatCurrency(total)}</span></CardTitle><div className="relative w-80 max-w-full"><Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search receipt, member, reference, category…" className="pl-8" /></div></CardHeader>
        <CardContent>
          {isLoading ? <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div> : filtered.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground"><ReceiptIcon className="h-6 w-6 mx-auto mb-2 opacity-50" />No receipts found.</div> :
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-4">Receipt #</th><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Member</th><th className="py-2 pr-4">Category</th><th className="py-2 pr-4">Method</th><th className="py-2 pr-4 text-right">Amount</th><th className="py-2 pr-4">Status</th><th className="py-2 pr-4"></th></tr></thead>
              <tbody>{filtered.map((r) => <tr key={r.id} className="border-t border-border"><td className="py-2 pr-4 font-mono">{r.receipt_number}</td><td className="py-2 pr-4">{r.transaction_date}</td><td className="py-2 pr-4">{r.member_name ?? "—"}</td><td className="py-2 pr-4">{r.offering_categories?.name ?? "—"}</td><td className="py-2 pr-4 capitalize">{r.payment_method.replace("_", " ")}</td><td className="py-2 pr-4 text-right">{formatCurrency(r.amount)}</td><td className="py-2 pr-4"><LockStatusBadge isLocked={r.is_locked} reversedAt={r.reversed_at} approvalStatus={r.approval_status} /></td><td className="py-2 pr-4 text-right"><div className="flex items-center justify-end gap-1"><RecordActions table="receipts" id={r.id} approvalStatus={r.approval_status} isLocked={r.is_locked || !!r.reversed_at} onEdit={() => setEditing(r)} invalidateKeys={["receipts", "dashboard", "funds"]} /><LockRowActions table="receipts" id={r.id} isLocked={r.is_locked} reversedAt={r.reversed_at} approvalStatus={r.approval_status} rejectionReason={r.rejection_reason} invalidateKeys={["receipts", "dashboard"]} /><Button size="sm" variant="ghost" onClick={() => setPrinting([r])}><Printer className="h-4 w-4" /></Button></div></td></tr>)}</tbody>
            </table></div>}
        </CardContent>
      </Card>
      {editing && <EditReceiptDialog receipt={editing} categories={cats} departments={departments} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["receipts"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); qc.invalidateQueries({ queryKey: ["funds"] }); }} />}
      {printing && <PrintReceiptDialog receipts={printing} church={church} onClose={() => setPrinting(null)} />}
    </div>
  );
}

function EditReceiptDialog({ receipt, categories, departments, onClose, onSaved }: { receipt: ReceiptRow; categories: Category[]; departments: Department[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ transaction_date: receipt.transaction_date, member_name: receipt.member_name ?? "", membership_number: receipt.membership_number ?? "", phone: receipt.phone ?? "", department_id: receipt.department_id ?? "", offering_category_id: "", amount: String(receipt.amount), payment_method: receipt.payment_method as (typeof PAY)[number], reference_number: receipt.reference_number ?? "", description: receipt.description ?? "" });
  const save = useMutation({ mutationFn: async () => { const amount = Number(f.amount); if (!f.member_name.trim()) throw new Error("Giver's name is required"); if (!amount || amount <= 0) throw new Error("Enter a valid amount"); const { error } = await supabase.from("receipts").update({ transaction_date: f.transaction_date, member_name: f.member_name.trim(), membership_number: f.membership_number || null, phone: f.phone || null, department_id: f.department_id || null, ...(f.offering_category_id ? { offering_category_id: f.offering_category_id } : {}), amount, payment_method: f.payment_method, reference_number: f.reference_number || null, description: f.description || null }).eq("id", receipt.id); if (error) throw error; }, onSuccess: () => { toast.success("Receipt updated"); onSaved(); }, onError: (e: any) => toast.error(e.message ?? "Unable to update receipt") });
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Edit receipt {receipt.receipt_number}</DialogTitle></DialogHeader><div className="grid gap-3 md:grid-cols-2"><div><Label>Date</Label><Input type="date" value={f.transaction_date} onChange={(e) => setF({ ...f, transaction_date: e.target.value })} /></div><div><Label>Giver's name *</Label><Input value={f.member_name} onChange={(e) => setF({ ...f, member_name: e.target.value })} /></div><div><Label>Membership #</Label><Input value={f.membership_number} onChange={(e) => setF({ ...f, membership_number: e.target.value })} /></div><div><Label>Phone</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div><div><Label>Category</Label><Select value={f.offering_category_id} onValueChange={(v) => setF({ ...f, offering_category_id: v })}><SelectTrigger><SelectValue placeholder={receipt.offering_categories?.name ?? "Keep current"} /></SelectTrigger><SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Amount (KES) *</Label><Input type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div><div><Label>Payment method</Label><Select value={f.payment_method} onValueChange={(v) => setF({ ...f, payment_method: v as any })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PAY.map((p) => <SelectItem key={p} value={p}>{p.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div><div><Label>Reference #</Label><Input value={f.reference_number} onChange={(e) => setF({ ...f, reference_number: e.target.value })} /></div><div><Label>Department</Label><Select value={f.department_id} onValueChange={(v) => setF({ ...f, department_id: v })}><SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger><SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div><div className="md:col-span-2"><Label>Notes</Label><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save changes"}</Button></DialogFooter></DialogContent></Dialog>;
}

function NewReceiptDialog({ church, categories, members, departments, onDone }: { church: { id: string; name: string }; categories: Category[]; members: Member[]; departments: Department[]; onDone: (rows: ReceiptRow[] | null) => void }) {
  const [mode, setMode] = useState<"single" | "multi">("single");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [memberSearch, setMemberSearch] = useState("");
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [form, setForm] = useState({ transaction_date: new Date().toISOString().slice(0, 10), member_id: "", member_name: "", membership_number: "", phone: "", department: "", department_id: "", offering_category_id: "", amount: "", payment_method: "cash" as (typeof PAY)[number], reference_number: "", description: "" });
  const multiTotal = useMemo(() => categories.reduce((s, c) => s + (Number(amounts[c.id]) || 0), 0), [categories, amounts]);
  const matchingMembers = useMemo(() => { const term = memberSearch.trim().toLowerCase(); if (!term) return members.slice(0, 12); return members.filter((m) => m.full_name.toLowerCase().includes(term) || (m.membership_number ?? "").toLowerCase().includes(term) || (m.phone ?? "").toLowerCase().includes(term)).slice(0, 12); }, [members, memberSearch]);
  const selectMember = (m: Member) => { setForm({ ...form, member_id: m.id, member_name: m.full_name, membership_number: m.membership_number ?? "", phone: m.phone ?? "", department: m.department ?? "" }); setMemberSearch(m.full_name); setMemberPickerOpen(false); };
  const startNewGiver = () => { setForm({ ...form, member_id: "", member_name: memberSearch.trim(), membership_number: "", phone: "", department: "" }); setMemberPickerOpen(false); };
  const create = useMutation({ mutationFn: async () => { if (!form.member_name.trim()) throw new Error("Enter the giver's name"); const { data: uData } = await supabase.auth.getUser(); const base = `R-${Date.now().toString().slice(-8)}`; const lines = mode === "single" ? [{ offering_category_id: form.offering_category_id, amount: Number(form.amount) }] : categories.map((c) => ({ offering_category_id: c.id, amount: Number(amounts[c.id]) || 0 })).filter((l) => l.amount > 0); if (mode === "single") { if (!form.offering_category_id) throw new Error("Select an offering category"); if (!lines[0]!.amount || lines[0]!.amount <= 0) throw new Error("Enter a valid amount"); } else if (!lines.length) throw new Error("Enter at least one category amount"); const payload = lines.map((l, i) => ({ church_id: church.id, receipt_number: lines.length > 1 ? `${base}-${i + 1}` : base, transaction_date: form.transaction_date, member_id: form.member_id || null, member_name: form.member_name.trim(), membership_number: form.membership_number || null, phone: form.phone || null, department: form.department || null, department_id: form.department_id || null, offering_category_id: l.offering_category_id, amount: l.amount, payment_method: form.payment_method, reference_number: form.reference_number || null, description: form.description || null, recorded_by: uData.user?.id ?? null })); const { data, error } = await supabase.from("receipts").insert(payload).select("id,receipt_number,transaction_date,member_name,membership_number,amount,payment_method,is_locked,reversed_at,offering_categories(name,fund_type)"); if (error) throw error; return (data ?? []) as unknown as ReceiptRow[]; }, onSuccess: (rows) => { toast.success(rows.length > 1 ? `${rows.length} receipt lines recorded for ${form.member_name.trim()}` : `Receipt ${rows[0]?.receipt_number} recorded`); onDone(rows); }, onError: (e: any) => toast.error(e.message ?? "Failed to save") });
  return <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>New Receipt</DialogTitle></DialogHeader><div className="flex gap-2"><Button size="sm" variant={mode === "single" ? "default" : "outline"} onClick={() => setMode("single")}>Single category</Button><Button size="sm" variant={mode === "multi" ? "default" : "outline"} onClick={() => setMode("multi")}>All categories at once</Button></div><div className="grid gap-3 md:grid-cols-2"><div><Label>Date</Label><Input type="date" value={form.transaction_date} onChange={(e) => setForm({ ...form, transaction_date: e.target.value })} /></div><div className="relative"><Label>Existing member / new giver</Label><div className="relative mt-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={memberSearch} onFocus={() => setMemberPickerOpen(true)} onChange={(e) => { setMemberSearch(e.target.value); setMemberPickerOpen(true); if (form.member_id) setForm({ ...form, member_id: "", member_name: "", membership_number: "", phone: "", department: "" }); }} placeholder="Search name, membership # or phone" className="pl-9 pr-9" autoComplete="off" />{memberSearch && <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setMemberSearch(""); setMemberPickerOpen(true); setForm({ ...form, member_id: "", member_name: "", membership_number: "", phone: "", department: "" }); }} aria-label="Clear member search"><X className="h-4 w-4" /></button>}</div>{memberPickerOpen && <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md overflow-hidden"><div className="max-h-56 overflow-y-auto">{matchingMembers.map((m) => <button key={m.id} type="button" className="w-full px-3 py-2 text-left hover:bg-accent transition-colors" onMouseDown={(e) => e.preventDefault()} onClick={() => selectMember(m)}><div className="font-medium text-sm">{m.full_name}</div><div className="text-xs text-muted-foreground">{m.membership_number ? `Membership #${m.membership_number}` : "No membership #"}{m.phone ? ` · ${m.phone}` : ""}</div></button>)}{matchingMembers.length === 0 && <div className="px-3 py-3 text-sm text-muted-foreground">No existing member found.</div>}</div><button type="button" className="w-full flex items-center gap-2 border-t border-border px-3 py-2 text-sm font-medium text-primary hover:bg-accent" onMouseDown={(e) => e.preventDefault()} onClick={startNewGiver}><UserPlus className="h-4 w-4" /> Use as new giver</button></div>} {form.member_id && <div className="mt-1 text-xs text-primary">Existing member selected · details filled automatically</div>}</div><div className="md:col-span-2"><Label>Giver's name *</Label><Input value={form.member_name} onChange={(e) => { setForm({ ...form, member_name: e.target.value, member_id: "" }); setMemberSearch(e.target.value); }} placeholder="Full name" /></div><div><Label>Membership #</Label><Input value={form.membership_number} onChange={(e) => setForm({ ...form, membership_number: e.target.value })} /></div><div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>{mode === "single" ? <><div><Label>Offering category *</Label><Select value={form.offering_category_id} onValueChange={(v) => setForm({ ...form, offering_category_id: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.fund_type})</SelectItem>)}</SelectContent></Select></div><div><Label>Amount (KES) *</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div></> : <div className="md:col-span-2"><Label>Contributions by category *</Label><div className="mt-2 max-h-[45vh] overflow-y-auto rounded-md border border-border divide-y divide-border">{categories.map((c) => <div key={c.id} className="flex items-center gap-3 px-3 py-2"><div className="flex-1 text-sm">{c.name} <span className="text-xs text-muted-foreground">({c.fund_type})</span></div><Input className="w-32" type="number" step="0.01" placeholder="0.00" value={amounts[c.id] ?? ""} onChange={(e) => setAmounts({ ...amounts, [c.id]: e.target.value })} /></div>)}</div><div className="mt-2 flex justify-between rounded-md border border-border bg-background px-3 py-2 text-sm font-medium"><span>Total</span><span>{formatCurrency(multiTotal)}</span></div></div>}<div><Label>Payment method</Label><Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v as any })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PAY.map((p) => <SelectItem key={p} value={p}>{p.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div><div><Label>Reference #</Label><Input value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} placeholder="M-Pesa code, cheque #" /></div><div><Label>Department</Label><Select value={form.department_id} onValueChange={(v) => setForm({ ...form, department_id: v })}><SelectTrigger><SelectValue placeholder="Select department (optional)" /></SelectTrigger><SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div><div className="md:col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={() => onDone(null)}>Cancel</Button><Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Saving…" : "Save & Print"}</Button></DialogFooter></DialogContent>;
}

function PrintReceiptDialog({ receipts, church, onClose }: { receipts: ReceiptRow[]; church: { name: string; address?: string | null; city?: string | null; phone?: string | null }; onClose: () => void }) {
  const receipt = receipts[0]!; const total = receipts.reduce((s, r) => s + Number(r.amount || 0), 0);
  return <Dialog open onOpenChange={(v) => !v && onClose()}><DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Receipt Preview</DialogTitle></DialogHeader><div id="receipt-print" className="border border-border rounded-md p-6 text-sm bg-card"><div className="text-center border-b border-border pb-3 mb-3"><div className="font-bold text-primary text-lg">{church.name}</div><div className="text-xs text-muted-foreground">{[church.address, church.city].filter(Boolean).join(", ")}{church.phone ? ` · ${church.phone}` : ""}</div><div className="mt-2 font-semibold">OFFICIAL RECEIPT</div></div><div className="grid grid-cols-2 gap-2"><div><span className="text-muted-foreground">Receipt #:</span> <span className="font-mono">{receipts.map((r) => r.receipt_number).join(", ")}</span></div><div><span className="text-muted-foreground">Date:</span> {receipt.transaction_date}</div><div className="col-span-2"><span className="text-muted-foreground">Received from:</span> <span className="font-medium">{receipt.member_name}</span></div><div className="col-span-2"><div className="text-muted-foreground">Being:</div><table className="w-full mt-1"><tbody>{receipts.map((r) => <tr key={r.id}><td className="py-0.5">{r.offering_categories?.name ?? "—"}</td><td className="py-0.5 text-right">{formatCurrency(r.amount)}</td></tr>)}</tbody></table></div><div><span className="text-muted-foreground">Method:</span> <span className="capitalize">{receipt.payment_method.replace("_", " ")}</span></div><div className="text-right"><span className="text-muted-foreground">Total:</span> <span className="font-bold">{formatCurrency(total)}</span></div></div><div className="mt-6 pt-4 border-t border-border text-xs text-muted-foreground text-center italic">Thank you for your faithful stewardship. — Malachi 3:10</div><div className="mt-6 flex justify-between text-xs"><div>__________________<br/>Treasurer's signature</div><div className="text-right">__________________<br/>Giver's signature</div></div></div><DialogFooter><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={() => printElement("receipt-print", `Receipt ${receipt.receipt_number}`)}><Printer className="h-4 w-4 mr-1" /> Print</Button></DialogFooter></DialogContent></Dialog>;
}
