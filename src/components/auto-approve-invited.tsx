import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { autoApproveInvitedUsers } from "@/lib/admin.functions";
import { useCurrentChurch } from "@/lib/church";
import { isAdmin, useUserRoles } from "@/lib/access";

/**
 * While an administrator has the app open, approve invited people as soon as
 * they have signed up: on load, when the tab regains focus, and every 30s.
 * Renders nothing. People who were not invited stay in Pending approvals.
 */
export function AutoApproveInvited() {
  const { data: roles } = useUserRoles();
  const { data: church } = useCurrentChurch();
  const run = useServerFn(autoApproveInvitedUsers);
  const qc = useQueryClient();
  const admin = isAdmin(roles);
  const churchId = church?.id;

  useEffect(() => {
    if (!admin || !churchId) return;
    let busy = false;
    const tick = async () => {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      try {
        const { approved } = await run({ data: { churchId } });
        if (approved.length) {
          toast.success(
            approved.length === 1
              ? `${approved[0].email} was approved as ${approved[0].role}`
              : `${approved.length} invited users were approved`,
          );
          qc.invalidateQueries({ queryKey: ["managed-users"] });
        }
      } catch {
        /* silent: the manual Pending approvals list still works */
      } finally {
        busy = false;
      }
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [admin, churchId, run, qc]);

  return null;
}
