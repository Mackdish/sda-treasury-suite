import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, resolveChurchId, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_receipts",
  title: "List receipts",
  description:
    "List offering and tithe receipts for the signed-in treasurer's church within an optional date range (YYYY-MM-DD).",
  inputSchema: {
    start_date: z.string().describe("Inclusive start date, YYYY-MM-DD.").optional(),
    end_date: z.string().describe("Inclusive end date, YYYY-MM-DD.").optional(),
    limit: z.number().int().describe("Maximum rows to return (default 50, max 200).").optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ start_date, end_date, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const churchId = await resolveChurchId(supabase, ctx.getUserId());
    if (!churchId) return { content: [{ type: "text", text: "No church is linked to this account." }], isError: true };

    let query = supabase
      .from("receipts")
      .select(
        "id,receipt_number,transaction_date,amount,payment_method,member_name,description,approval_status,offering_categories(name,fund_type,conference_split_pct)",
      )
      .neq("approval_status", "deleted")
      .eq("church_id", churchId)
      .order("transaction_date", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 50, 1), 200));
    if (start_date) query = query.gte("transaction_date", start_date);
    if (end_date) query = query.lte("transaction_date", end_date);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { receipts: data ?? [] },
    };
  },
});