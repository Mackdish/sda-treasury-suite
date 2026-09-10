import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { completeUserInvitation } from "@/lib/users.functions";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import sdaLogo from "@/assets/sda-logo.png";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string; invite?: string } => ({
    ...(typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? { next: s.next } : {}),
    ...(typeof s.invite === "string" && s.invite.length >= 32 ? { invite: s.invite } : {}),
  }),
  head: () => ({ meta: [{ title: "Sign in — SDA Treasurer" }, { name: "description", content: "Sign in to the SDA Church Treasurer system." }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next, invite } = Route.useSearch();
  const complete = useServerFn(completeUserInvitation);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");

  async function finishInvitation(token: string) {
    const result = await complete({ data: { token } });
    setInviteMessage(`Your ${result?.role ?? "church"} account is ready.`);
    return result;
  }

  async function afterAuth(token = invite) {
    if (token) {
      try {
        await finishInvitation(token);
        toast.success("Invitation accepted. Your account is ready.");
      } catch (e: any) {
        // A normal sign-in without an invitation must continue to work.
        if (invite) toast.error(e?.message ?? "Could not accept the invitation");
      }
    }
    if (next) {
      window.location.href = next;
      return;
    }
    navigate({ to: "/dashboard" });
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) afterAuth();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, next, invite]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }
    try {
      await afterAuth();
    } finally {
      setLoading(false);
    }
    toast.success("Welcome back");
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: invite
          ? `${window.location.origin}/auth?invite=${encodeURIComponent(invite)}`
          : next
            ? `${window.location.origin}${next}`
            : window.location.origin,
        data: { full_name: fullName },
      },
    });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }

    if (data.session) {
      try {
        await afterAuth();
      } catch (e: any) {
        toast.error(e?.message ?? "Could not complete invitation");
      }
    } else {
      toast.success("Account created. Check your email, then open the invitation link again to finish setup.");
    }
    setLoading(false);
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: invite
        ? `${window.location.origin}/auth?invite=${encodeURIComponent(invite)}`
        : next
          ? `${window.location.origin}${next}`
          : window.location.origin,
    });
    if (result.error) return toast.error("Google sign-in failed");
    if (result.redirected) return;
    afterAuth();
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <div className="hidden md:flex flex-col justify-between p-10 bg-sidebar text-sidebar-foreground">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <img src={sdaLogo} alt="Seventh-day Adventist Church logo" className="h-10 w-10 object-contain" width={40} height={40} />
          SDA Treasurer
        </Link>
        <div>
          <h2 className="text-3xl font-bold">Faithful stewardship, digitized.</h2>
          <p className="mt-3 text-sidebar-foreground/80 max-w-sm">Automate the Church Treasurer&apos;s Cash Statement, Weekly Offerings Report and Conference Remittance — without changing your official format.</p>
        </div>
        <p className="text-xs text-sidebar-foreground/60">&quot;Bring ye all the tithes into the storehouse.&quot; — Malachi 3:10</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{invite ? "Accept your invitation" : "Welcome"}</CardTitle>
            <CardDescription>
              {invite ? "Create your own secure password to join your church treasury." : "Sign in to your church treasury account."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invite && <div className="mb-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">You were invited by a church administrator. Your role and church access are assigned securely after authentication.</div>}
            {inviteMessage && <div className="mb-4 rounded-md border p-3 text-sm">{inviteMessage}</div>}
            <Tabs defaultValue={invite ? "signup" : "signin"}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4 mt-4">
                  <div className="space-y-1"><Label htmlFor="email">Email</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                  <div className="space-y-1"><Label htmlFor="password">Password</Label><Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                  <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4 mt-4">
                  <div className="space-y-1"><Label htmlFor="name">Full name</Label><Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
                  <div className="space-y-1"><Label htmlFor="email2">Email</Label><Input id="email2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                  <div className="space-y-1"><Label htmlFor="password2">Password</Label><Input id="password2" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                  <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creating account…" : "Create account"}</Button>
                </form>
              </TabsContent>
            </Tabs>
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" /></div>
            <Button type="button" variant="outline" className="w-full" onClick={handleGoogle}>Continue with Google</Button>
            <p className="mt-4 text-xs text-muted-foreground text-center">Accounts created normally require administrator approval unless they are completed from a valid administrator invitation.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
