import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, resolveChurchId, supabaseForUser } from "../supabase";

export default defineTool({
  name: "cash_summary",
  title: "Cash summary for a period",
  description:
    "Summarise receipts and expenses for a date range, splitting each offering category into the conference share and the local church share (tithe 100% conference, combined offering and first fruit 50/50, all others 100% local).",
  inputSchema: {
    start_date: z.string().describe("Inclusive start date, YYYY-MM-DD."),
    end_date: z.string().describe("Inclusive end date, YYYY-MM-DD."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ start_date, end_date }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const churchId = await resolveChurchId(supabase, ctx.getUserId());
    if (!churchId) return { content: [{ type: "text", text: "No church is linked to this account." }], isError: true };

    const [receipts, expenses] = await Promise.all([
      supabase
        .from("receipts")
        .select("amount,offering_categories(name,fund_type,conference_split_pct)")
        .neq("approval_status", "deleted")
        .eq("church_id", churchId)
        .gte("transaction_date", start_date)
        .lte("transaction_date", end_date),
      supabase
        .from("expenses")
        .select("amount")
        .eq("church_id", churchId)
        .gte("transaction_date", start_date)
        .lte("transaction_date", end_date),
    ]);
    if (receipts.error) return { content: [{ type: "text", text: receipts.error.message }], isError: true };

    const byCategory = new Map<string, { total: number; conference: number; local: number; split_pct: number }>();
    let total = 0;
    let conference = 0;
    for (const row of (receipts.data ?? []) as Array<Record<string, any>>) {
      const amount = Number(row.amount ?? 0);
      const cat = row.offering_categories ?? {};
      const name = cat.name ?? "Uncategorised";
      const pct = Number(cat.conference_split_pct ?? 0);
      const conf = (amount * pct) / 100;
      const entry = byCategory.get(name) ?? { total: 0, conference: 0, local: 0, split_pct: pct };
      entry.total += amount;
      entry.conference += conf;
      entry.local += amount - conf;
      byCategory.set(name, entry);
      total += amount;
      conference += conf;
    }
    const totalExpenses = ((expenses.data ?? []) as Array<Record<string, any>>).reduce(
      (sum, e) => sum + Number(e.amount ?? 0),
      0,
    );

    const summary = {
      period: { start_date, end_date },
      total_receipts: total,
      conference_share: conference,
      local_share: total - conference,
      total_expenses: totalExpenses,
      net_balance: total - totalExpenses,
      categories: Array.from(byCategory.entries()).map(([name, v]) => ({ name, ...v })),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary) }],
      structuredContent: summary,
    };
  },
});