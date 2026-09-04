import { type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Clock, ShieldAlert, UserX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ensureProfile, myAccountStatus } from "@/lib/admin.functions";

/**
 * Makes sure the signed-in user has a profile row (the database has no auth
 * trigger, so it is created here) and blocks access until an administrator
 * approves the account.
 */
export function AccountGate({ children }: { children: ReactNode }) {
  const ensure = useServerFn(ensureProfile);
  const status = useServerFn(myAccountStatus);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["account-status"],
    staleTime: 60 * 1000,
    queryFn: async () => {
      await ensure({ data: {} });
      return status();
    },
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Preparing your account…</div>;
  }

  if (data && data.approvalStatus !== "approved") {
    const rejected = data.approvalStatus === "rejected";
    return (
      <Notice
        icon={rejected ? <ShieldAlert className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
        title={rejected ? "Registration declined" : "Awaiting approval"}
        body={
          rejected
            ? (data.rejectionReason ?? "An administrator declined your registration request.")
            : "Your account has been created and is waiting for an administrator to approve it. You will get access as soon as it is reviewed."
        }
        onSignOut={signOut}
      />
    );
  }

  if (data && !data.isActive) {
    return (
      <Notice
        icon={<UserX className="h-5 w-5" />}
        title="Account deactivated"
        body="Your access has been suspended by an administrator. Contact your church administrator to restore it."
        onSignOut={signOut}
      />
    );
  }

  return <>{children}</>;
}

function Notice({
  icon,
  title,
  body,
  onSignOut,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  onSignOut: () => void;
}) {
  return (
    <div className="grid place-items-center py-16">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 text-center space-y-3">
          <div className="mx-auto h-10 w-10 rounded-full bg-muted text-muted-foreground grid place-items-center">
            {icon}
          </div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{body}</p>
          <Button variant="secondary" size="sm" onClick={onSignOut}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
