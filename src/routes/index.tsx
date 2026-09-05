import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Wallet, BarChart3, FileText, ArrowRight } from "lucide-react";
import sdaLogo from "@/assets/sda-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SDA Treasurer — Digital church treasury" },
      { name: "description", content: "Replace paper bookkeeping with a modern digital church treasury. Automate receipts, cash statements, trust funds and conference remittances." },
      { property: "og:title", content: "SDA Treasurer — Digital church treasury" },
      { property: "og:description", content: "Replace paper bookkeeping with a modern digital church treasury. Automate receipts, cash statements, trust funds and conference remittances." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) navigate({ to: "/dashboard" });
      else setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (checking) {
    return <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-sidebar text-sidebar-foreground">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <img src={sdaLogo} alt="Seventh-day Adventist Church logo" className="h-10 w-10 object-contain" width={40} height={40} />
            <span>SDA Treasurer</span>
            <span className="font-semibold text-sidebar-foreground/80">WOTE CENTRAL SDA CHURCH</span>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="secondary"><Link to="/auth">Sign in</Link></Button>
          </div>
        </div>
      </header>
      <main>
        <section className="mx-auto max-w-6xl px-6 py-20 grid gap-10 md:grid-cols-2 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-gold" /> For SDA local churches
            </div>
            <h1 className="mt-4 text-4xl md:text-5xl font-bold tracking-tight text-primary">
              Modern digital treasury for your church.
            </h1>
            <p className="mt-4 text-lg text-muted-foreground max-w-prose">
              Replace paper cash statements and offering summaries with a secure, mobile-friendly system that
              handles receipts, trust funds, remittances and reports — automatically.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link to="/auth">Get started <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Wallet, title: "Receipts & Cash", body: "Sequential receipts across cash, M-Pesa, bank & cheque." },
              { icon: FileText, title: "Cash Statement", body: "Auto-calculated SDA Cash Statement, ready to print." },
              { icon: BarChart3, title: "Reports", body: "Weekly, monthly & annual reports with charts." },
              { icon: ShieldCheck, title: "Secure", body: "Role-based access, RLS, and full audit trail." },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-card p-4">
                <div className="h-9 w-9 rounded-md bg-primary text-primary-foreground grid place-items-center">
                  <f.icon className="h-5 w-5" />
                </div>
                <div className="mt-3 font-semibold">{f.title}</div>
                <div className="text-sm text-muted-foreground">{f.body}</div>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Built for Seventh-day Adventist local church treasurers.
      </footer>
    </div>
  );
}
