import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Github, Plus } from "lucide-react";
import { toast } from "sonner";

interface GitHubAccountsListProps {
  userId: string;
  selectedAccountId: string | null;
  onSelectAccount: (id: string) => void;
}

const GitHubAccountsList = ({ userId, selectedAccountId, onSelectAccount }: GitHubAccountsListProps) => {
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

  const handleConnectGitHub = () => {
    toast.info("GitHub OAuth integration coming soon! For now, this is a demo interface.");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Github className="w-5 h-5" />
              GitHub Accounts
            </CardTitle>
            <CardDescription>
              Connect and manage your GitHub accounts
            </CardDescription>
          </div>
          <Button onClick={handleConnectGitHub} className="gap-2">
            <Plus className="w-4 h-4" />
            Connect GitHub
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading accounts...</div>
        ) : accounts && accounts.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => (
              <button
                key={account.id}
                onClick={() => onSelectAccount(account.id)}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  selectedAccountId === account.id
                    ? "border-primary bg-primary/5 shadow-glow"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={account.avatar_url || undefined} />
                    <AvatarFallback>{account.github_username[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{account.github_username}</div>
                    <div className="text-xs text-muted-foreground">
                      ID: {account.github_user_id}
                    </div>
                  </div>
                  {selectedAccountId === account.id && (
                    <Badge variant="default">Selected</Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 space-y-4">
            <Github className="w-16 h-16 mx-auto text-muted-foreground" />
            <div>
              <p className="text-muted-foreground">No GitHub accounts connected yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Connect your GitHub account to get started
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GitHubAccountsList;
