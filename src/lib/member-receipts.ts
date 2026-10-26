import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/** Minimal receipt shape needed for grouping and for the combined receipt. */
export type MemberReceiptLine = {
  id: string;
  receipt_number: string;
  transaction_date: string;
  member_id?: string | null;
  member_name: string | null;
  membership_number: string | null;
  phone?: string | null;
  amount: number;
  payment_method: string;
  reference_number?: string | null;
  reversed_at: string | null;
  approval_status: "draft" | "pending" | "approved" | "rejected";
  offering_categories: { name: string; fund_type: string } | null;
};

export type MemberGroup<T extends MemberReceiptLine = MemberReceiptLine> = {
  key: string;
  name: string;
  membershipNumber: string | null;
  phone: string | null;
  /** Every receipt for this member, newest first (includes reversed/rejected so they stay visible). */
  receipts: T[];
  /** Receipts that count towards money actually received (not reversed, not rejected). */
  countable: T[];
  /** Sum of `countable`. */
  total: number;
};

const norm = (s?: string | null) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** A receipt counts as money received unless it was reversed or rejected. */
export const isCountable = (r: Pick<MemberReceiptLine, "reversed_at" | "approval_status">) =>
  !r.reversed_at && r.approval_status !== "rejected";

/**
 * Groups receipts by the member who gave them, so several payments by the same
 * person sit together. Matching order: member_id → membership number → name.
 * Receipts typed in without a member link (e.g. an older receipt for someone who
 * was later registered) are attached to the registered member when the
 * membership number or name matches.
 */
export function groupReceiptsByMember<T extends MemberReceiptLine>(rows: T[]): MemberGroup<T>[] {
  const idByNumber = new Map<string, string>();
  const idByName = new Map<string, string>();
  for (const r of rows) {
    if (!r.member_id) continue;
    if (norm(r.membership_number)) idByNumber.set(norm(r.membership_number), r.member_id);
    if (norm(r.member_name)) idByName.set(norm(r.member_name), r.member_id);
  }

  const keyOf = (r: T): string => {
    if (r.member_id) return `id:${r.member_id}`;
    const num = norm(r.membership_number);
    if (num) return idByNumber.has(num) ? `id:${idByNumber.get(num)}` : `no:${num}`;
    const name = norm(r.member_name);
    if (name) return idByName.has(name) ? `id:${idByName.get(name)}` : `name:${name}`;
    return "unnamed";
  };

  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }

  const groups: MemberGroup<T>[] = [];
  for (const [key, list] of map) {
    const receipts = [...list].sort(
      (a, b) =>
        b.transaction_date.localeCompare(a.transaction_date) ||
        b.receipt_number.localeCompare(a.receipt_number),
    );
    const countable = receipts.filter(isCountable);
    const pick = <K extends keyof MemberReceiptLine>(f: K) =>
      (receipts.find((r) => r[f]) as T | undefined)?.[f] as string | null | undefined;
    groups.push({
      key,
      name: pick("member_name")?.trim() || "Unnamed giver",
      membershipNumber: pick("membership_number") ?? null,
      phone: pick("phone") ?? null,
      receipts,
      countable,
      total: countable.reduce((s, r) => s + Number(r.amount || 0), 0),
    });
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

export type CombinedReceiptChurch = {
  name: string;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  treasurer_name?: string | null;
};

const money = (n: number) => n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const label = (s: string) =>
  s === "mpesa" ? "M-Pesa" : s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const fundLabel = (s?: string | null) => (s === "trust" ? "Trust" : s === "camp" ? "Camp" : s === "local" ? "Local" : "—");

/**
 * One combined official receipt per member: every payment that member made
 * (date, receipt no., category, method, reference), a total, and a summary by
 * category. Each member starts on a fresh page.
 */
export function generateCombinedReceiptsPdf(
  groups: MemberGroup[],
  church: CombinedReceiptChurch,
  period?: { from?: string; to?: string },
): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const location = [church.address, church.city].filter(Boolean).join(", ");
  const periodText =
    period?.from || period?.to ? `${period.from || "start"} to ${period.to || "date"}` : "All recorded payments";
  const issued = new Date().toISOString().slice(0, 10);

  const withReceipts = groups.filter((g) => g.countable.length > 0);
  withReceipts.forEach((g, index) => {
    if (index > 0) doc.addPage();

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(20, 60, 40);
    doc.text(church.name.toUpperCase(), pageWidth / 2, 50, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90);
    const sub = [location, church.phone].filter(Boolean).join(" · ");
    if (sub) doc.text(sub.toUpperCase(), pageWidth / 2, 66, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20);
    doc.text("COMBINED OFFICIAL RECEIPT", pageWidth / 2, 90, { align: "center" });

    // Member block
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90);
    doc.text("Received from:", marginX, 118);
    doc.text("Period:", pageWidth / 2 + 20, 118);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20);
    doc.text(g.name, marginX + 76, 118);
    doc.text(periodText, pageWidth / 2 + 58, 118);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90);
    doc.text("Membership #:", marginX, 134);
    doc.text("Date issued:", pageWidth / 2 + 20, 134);
    doc.setTextColor(20);
    doc.text(g.membershipNumber || "—", marginX + 76, 134);
    doc.text(issued, pageWidth / 2 + 80, 134);
    if (g.phone) {
      doc.setTextColor(90);
      doc.text("Phone:", marginX, 150);
      doc.setTextColor(20);
      doc.text(g.phone, marginX + 76, 150);
    }

    // Payments table (oldest first reads like a ledger)
    const lines = [...g.countable].sort(
      (a, b) =>
        a.transaction_date.localeCompare(b.transaction_date) ||
        a.receipt_number.localeCompare(b.receipt_number),
    );
    autoTable(doc, {
      startY: 164,
      head: [["DATE", "RECEIPT #", "CATEGORY", "FUND", "METHOD", "REF", "AMOUNT (KES)"]],
      body: lines.map((r) => [
        r.transaction_date,
        r.receipt_number,
        r.offering_categories?.name ?? "—",
        fundLabel(r.offering_categories?.fund_type),
        label(r.payment_method),
        r.reference_number || "",
        money(Number(r.amount || 0)),
      ]),
      foot: [[
        { content: `TOTAL (${lines.length} payment${lines.length === 1 ? "" : "s"})`, colSpan: 6, styles: { halign: "left", fontStyle: "bold" } },
        { content: money(g.total), styles: { halign: "right", fontStyle: "bold" } },
      ]],
      styles: { fontSize: 8.5, cellPadding: 4 },
      headStyles: { fillColor: [20, 60, 40], textColor: 255 },
      footStyles: { fillColor: [240, 240, 240], textColor: 20 },
      columnStyles: { 6: { halign: "right" } },
      showFoot: "lastPage",
      margin: { left: marginX, right: marginX },
    });
    let y = (doc as any).lastAutoTable.finalY + 18;

    // Summary by category
    const byCategory = new Map<string, number>();
    for (const r of lines) {
      const k = r.offering_categories?.name ?? "Uncategorised";
      byCategory.set(k, (byCategory.get(k) ?? 0) + Number(r.amount || 0));
    }
    if (y + 40 + byCategory.size * 18 > pageHeight - 150) {
      doc.addPage();
      y = 50;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20);
    doc.text("Summary by category", marginX, y);
    autoTable(doc, {
      startY: y + 6,
      body: [...byCategory.entries()].map(([name, amt]) => [name, money(amt)]),
      theme: "plain",
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: { 1: { halign: "right" } },
      tableWidth: 280,
      margin: { left: marginX },
    });
    y = (doc as any).lastAutoTable.finalY + 36;

    // Signatures
    if (y > pageHeight - 110) {
      doc.addPage();
      y = 60;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(20);
    doc.line(marginX, y, marginX + 160, y);
    doc.line(pageWidth - marginX - 160, y, pageWidth - marginX, y);
    doc.text(`Treasurer${church.treasurer_name ? `: ${church.treasurer_name}` : ""}`, marginX, y + 12);
    doc.text(`Giver: ${g.name}`, pageWidth - marginX - 160, y + 12);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(110);
    doc.text("Thank you for your faithful stewardship. — Malachi 3:10", pageWidth / 2, y + 44, { align: "center" });
  });

  if (withReceipts.length === 0) {
    doc.setFontSize(11);
    doc.text("No receipts to include.", marginX, 60);
  }
  return doc;
}

/** Builds the PDF and triggers a browser download. */
export function downloadCombinedReceipts(
  groups: MemberGroup[],
  church: CombinedReceiptChurch,
  period?: { from?: string; to?: string },
) {
  const doc = generateCombinedReceiptsPdf(groups, church, period);
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const date = new Date().toISOString().slice(0, 10);
  const name =
    groups.length === 1
      ? `combined-receipt-${slug(groups[0]!.name) || "member"}-${date}.pdf`
      : `combined-receipts-by-member-${date}.pdf`;
  doc.save(name);
}
