import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Github, Plus, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";

interface GitHubAccountsListProps {
  userId: string;
  selectedAccountId: string | null;
  onSelectAccount: (id: string) => void;
}

const GitHubAccountsList = ({ userId, selectedAccountId, onSelectAccount }: GitHubAccountsListProps) => {
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);

  const { data: githubConfig, isLoading: loadingConfig } = useQuery({
    queryKey: ["github-client-config"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("github-client-config");
      if (error) throw error;
      return data as { clientId: string };
    },
  });

  const clientId = useMemo(() => githubConfig?.clientId ?? "", [githubConfig?.clientId]);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["github-accounts", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("github_accounts")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Auto-select first account to avoid "no projects" confusion after reload.
  useEffect(() => {
    if (!selectedAccountId && accounts && accounts.length > 0) {
      onSelectAccount(accounts[0].id);
    }
  }, [accounts, onSelectAccount, selectedAccountId]);

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code && !isConnecting) {
        setIsConnecting(true);
        try {
          const { data, error } = await supabase.functions.invoke("github-oauth", {
            body: { code, userId },
          });

          if (error) throw error;

          toast.success(`GitHub account ${data.username} connected successfully!`);
          queryClient.invalidateQueries({ queryKey: ["github-accounts"] });

          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error: any) {
          toast.error(error.message || "Failed to connect GitHub account");
        } finally {
          setIsConnecting(false);
        }
      }
    };

    handleCallback();
  }, [userId, queryClient, isConnecting]);

  const handleConnectGitHub = () => {
    if (!clientId) {
      toast.error("GitHub is not configured yet. Please try again in a moment.");
      return;
    }

    const redirectUri = `${window.location.origin}${window.location.pathname}`;
    const scope = "repo";

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(
      clientId
    )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;

    window.location.href = authUrl;
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Github className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Connected Accounts</h3>
        </div>
        <Button
          onClick={handleConnectGitHub}
          size="sm"
          className="gap-2 h-8"
          disabled={loadingConfig || !clientId}
        >
          <Plus className="w-3 h-3" />
          Add Account
        </Button>
      </div>

      {isLoading || isConnecting ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="p-3 rounded-lg border border-border/30">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : accounts && accounts.length > 0 ? (
        <div className="space-y-2">
          {accounts.map((account) => (
            <button
              key={account.id}
              onClick={() => onSelectAccount(account.id)}
              className={`w-full p-3 rounded-lg border transition-all text-left flex items-center gap-3 ${
                selectedAccountId === account.id
                  ? "border-primary bg-primary/5 shadow-glow"
                  : "border-border/30 hover:border-primary/50 hover:bg-muted/20"
              }`}
            >
              <Avatar className="w-10 h-10">
                <AvatarImage src={account.avatar_url || undefined} />
                <AvatarFallback>{account.github_username[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{account.github_username}</div>
                <div className="text-xs text-muted-foreground">
                  ID: {account.github_user_id}
                </div>
              </div>
              {selectedAccountId === account.id && (
                <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 space-y-3">
          <Github className="w-12 h-12 mx-auto text-muted-foreground/30" />
          <div>
            <p className="text-sm text-muted-foreground">No accounts connected</p>
            <p className="text-xs text-muted-foreground mt-1">
              Connect your GitHub account to get started
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default GitHubAccountsList;
