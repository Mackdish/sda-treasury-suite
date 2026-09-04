import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentChurch } from "@/lib/church";
import { PageHeader, NoChurch } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { UserAccountsCard } from "@/features/admin/user-accounts-card";
import { BulkInviteCard } from "@/features/admin/bulk-invite-card";
import { UserManagementCard } from "@/features/admin/user-management-card";
import { NoticesCard } from "@/features/admin/notices-card";
import { SettingsCard } from "@/features/admin/settings-card";
import { DatabaseCard } from "@/features/admin/database-card";

export function AdminPage() {
  const { data: church } = useCurrentChurch();
  const qc = useQueryClient();

  const { data: cats = [] } = useQuery({
    queryKey: ["admin-offering-cats", church?.id],
    enabled: !!church,
    queryFn: async () => {
      const { data } = await supabase
        .from("offering_categories")
        .select("*")
        .eq("church_id", church!.id)
        .order("sort_order");
      return (data ?? []) as any[];
    },
  });

  const { data: expCats = [] } = useQuery({
    queryKey: ["admin-expense-cats", church?.id],
    enabled: !!church,
    queryFn: async () => {
      const { data } = await supabase
        .from("expense_categories")
        .select("*")
        .eq("church_id", church!.id)
        .order("name");
      return (data ?? []) as any[];
    },
  });

  // Offering category form
  const [cName, setCName] = useState("");
  const [cCode, setCCode] = useState("");
  const [cFund, setCFund] = useState<"trust" | "local" | "camp">("local");
  const [cSplit, setCSplit] = useState("0");

  const addCat = useMutation({
    mutationFn: async () => {
      if (!church || !cName) throw new Error("Name required");
      const { error } = await supabase.from("offering_categories").insert({
        church_id: church.id,
        name: cName,
        code: cCode || null,
        fund_type: cFund,
        conference_split_pct: Number(cSplit),
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Category added");
      setCName("");
      setCCode("");
      setCSplit("0");
      qc.invalidateQueries({ queryKey: ["admin-offering-cats"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const delCat = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("offering_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["admin-offering-cats"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Expense category
  const [eName, setEName] = useState("");
  const addExp = useMutation({
    mutationFn: async () => {
      if (!church || !eName) throw new Error("Name required");
      const { error } = await supabase
        .from("expense_categories")
        .insert({ church_id: church.id, name: eName, is_active: true });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Category added");
      setEName("");
      qc.invalidateQueries({ queryKey: ["admin-expense-cats"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const delExp = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expense_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-expense-cats"] }),
    onError: (e: any) => toast.error(e.message),
  });

  if (!church)
    return (
      <>
        <PageHeader title="Administration" />
        <NoChurch />
      </>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administration"
        description="Control panel for accounts, approvals, notices, contact details and church data."
      />

      <Tabs defaultValue="users">
        <TabsList className="flex-wrap">
          <TabsTrigger value="users">Users &amp; roles</TabsTrigger>
          <TabsTrigger value="notices">Notices</TabsTrigger>
          <TabsTrigger value="settings">Settings &amp; contact</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-6 pt-4">
          <UserManagementCard churchId={church.id} />
          <UserAccountsCard churchId={church.id} />
          <BulkInviteCard churchId={church.id} />
        </TabsContent>

        <TabsContent value="notices" className="pt-4">
          <NoticesCard churchId={church.id} />
        </TabsContent>

        <TabsContent value="settings" className="pt-4">
          <SettingsCard churchId={church.id} />
        </TabsContent>

        <TabsContent value="categories" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Offering categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-5 items-end">
                <div>
                  <Label>Name</Label>
                  <Input value={cName} onChange={(e) => setCName(e.target.value)} />
                </div>
                <div>
                  <Label>Code</Label>
                  <Input value={cCode} onChange={(e) => setCCode(e.target.value)} />
                </div>
                <div>
                  <Label>Fund type</Label>
                  <Select value={cFund} onValueChange={(v) => setCFund(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trust">Trust</SelectItem>
                      <SelectItem value="local">Local</SelectItem>
                      <SelectItem value="camp">Camp expense</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Conference %</Label>
                  <Input type="number" value={cSplit} onChange={(e) => setCSplit(e.target.value)} />
                </div>
                <Button onClick={() => addCat.mutate()} disabled={addCat.isPending}>
                  Add
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Code</th>
                      <th className="py-2 pr-4">Fund</th>
                      <th className="py-2 pr-4">Conf %</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {cats.map((c) => (
                      <tr key={c.id} className="border-t border-border">
                        <td className="py-1 pr-4">{c.name}</td>
                        <td className="py-1 pr-4 font-mono text-xs">{c.code ?? "—"}</td>
                        <td className="py-1 pr-4 capitalize">{c.fund_type}</td>
                        <td className="py-1 pr-4">{c.conference_split_pct}%</td>
                        <td className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => delCat.mutate(c.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Expense categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. Utilities"
                  value={eName}
                  onChange={(e) => setEName(e.target.value)}
                />
                <Button onClick={() => addExp.mutate()} disabled={addExp.isPending}>
                  Add
                </Button>
              </div>
              <ul className="divide-y divide-border text-sm">
                {expCats.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2">
                    <span>{c.name}</span>
                    <Button size="icon" variant="ghost" onClick={() => delExp.mutate(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="pt-4">
          <DatabaseCard churchId={church.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
