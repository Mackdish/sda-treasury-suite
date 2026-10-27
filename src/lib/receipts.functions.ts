import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Returns a single receipt for download, only when it belongs to the caller's
 *  linked member record. Staff roles are handled by their own screens. */
export const getMyReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ receiptId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, member_id")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile?.member_id) {
      throw new Error("Your account is not linked to a member record");
    }

    const { data: receipt, error } = await supabase
      .from("receipts")
      .select(
        "id,receipt_number,transaction_date,amount,payment_method,description,member_id,member_name,church_id,offering_categories(name,fund_type)",
      )
      .neq("approval_status", "deleted")
      .eq("id", data.receiptId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!receipt || receipt.member_id !== profile.member_id) {
      throw new Error("You can only download your own receipts");
    }

    const { data: church } = await supabase
      .from("churches")
      .select("name,address,city,treasurer_name,conference_id")
      .eq("id", receipt.church_id)
      .maybeSingle();

    let fieldName: string | null = null;
    if (church?.conference_id) {
      const { data: conf } = await supabase
        .from("conferences")
        .select("name")
        .eq("id", church.conference_id)
        .maybeSingle();
      fieldName = conf?.name ?? null;
    }

    const cat = (receipt as { offering_categories?: { name?: string; fund_type?: string } | null })
      .offering_categories;

    return {
      receiptNumber: receipt.receipt_number,
      transactionDate: receipt.transaction_date,
      memberName: receipt.member_name ?? profile.full_name ?? "",
      category: cat?.name ?? "Offering",
      fund: cat?.fund_type ?? "local",
      amount: Number(receipt.amount ?? 0),
      paymentMethod: receipt.payment_method as string,
      description: receipt.description ?? null,
      churchName: church?.name ?? "",
      fieldName,
      address: [church?.address, church?.city].filter(Boolean).join(", ") || null,
      treasurerName: church?.treasurer_name ?? null,
    };
  });
