import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import AuthPage from "@/components/auth/AuthPage";
import Dashboard from "@/components/dashboard/Dashboard";
import { toast } from "sonner";

const Index = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Handle GitHub account CONNECTION callback for already-logged-in users.
  // We only run this when state=gh_connect (not gh_auth, which is the sign-in flow
  // handled inside AuthPage.tsx).
  useEffect(() => {
    if (!session) return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");

    // Only process account-connect callbacks, never sign-in callbacks
    if (!code || state === "gh_auth") return;

    // Clear URL immediately so this doesn't re-fire on re-renders
    window.history.replaceState({}, document.title, window.location.pathname);

    const connectAccount = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("github-oauth", {
          body: { code, userId: session.user.id },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success(`GitHub account ${data.username} connected!`);
      } catch (err: any) {
        toast.error(err.message || "Failed to connect GitHub account");
      }
    };

    connectAccount();
  }, [session]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return session ? <Dashboard session={session} /> : <AuthPage />;
};

export default Index;
