import { useState, useEffect } from "react";
import { Session } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import CreateSyncGroup from "./CreateSyncGroup";
import RecentActivity from "./RecentActivity";
import { DashboardAnalytics } from "./DashboardAnalytics";
import kennyProfile from "@/assets/kenny-profile.png";
import {
  LogOut, Github, Plus, Search, Folder, GitBranch, Activity,
  ChevronRight, Rocket, ExternalLink, Clock, Settings, ArrowUpDown
} from "lucide-react";

interface DashboardProps {
  session: Session;
}

const Dashboard = ({ session }: DashboardProps) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Fetch GitHub accounts
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["github-accounts", session.user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("github_accounts")
        .select("id, github_username, avatar_url, github_user_id")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Auto-select first account
  useEffect(() => {
    if (accounts && accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  // Fetch sync groups
  const { data: syncGroups, isLoading: groupsLoading } = useQuery({
    queryKey: ["sync-groups", selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const { data } = await supabase
        .from("sync_groups")
        .select("*, mother_repo:repos!sync_groups_mother_repo_id_fkey(name, full_name), sync_group_repos(id)")
        .eq("account_id", selectedAccountId)
        .order("updated_at", { ascending: false });
      return data || [];
    },
    enabled: !!selectedAccountId,
  });

  // For create modal
  const { data: accountToken } = useQuery({
    queryKey: ["github-account-token", selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return null;
      const { data } = await supabase
        .from("github_accounts")
        .select("access_token")
        .eq("id", selectedAccountId)
        .single();
      return data;
    },
    enabled: !!selectedAccountId && showCreateModal,
  });

  const { data: repos } = useQuery({
    queryKey: ["github-repos", selectedAccountId],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("github-repos", {
        body: { accountId: selectedAccountId },
      });
      return data?.repos || [];
    },
    enabled: !!selectedAccountId && showCreateModal,
  });

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error(error.message);
    else toast.success("Signed out");
  };

  const handleConnectGitHub = () => {
    const clientId = "Ov23liZn3iNBDM6FbPB8";
    const redirectUri = `${window.location.origin}/`;
    const scope = "repo user:email";
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
  };

  const handleDisconnectAccount = async (accountId: string) => {
    const { error } = await supabase
      .from("github_accounts")
      .delete()
      .eq("id", accountId);
    if (error) { toast.error("Failed to disconnect"); return; }
    toast.success("Account disconnected");
    if (selectedAccountId === accountId) {
      setSelectedAccountId(null);
    }
  };

  const filteredGroups = syncGroups?.filter((g: any) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedAccount = accounts?.find((a) => a.id === selectedAccountId);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top Bar */}
      <header className="shrink-0 border-b border-border/30 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 md:px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Rocket className="w-4 h-4 text-primary" />
            </div>
            <h1 className="text-lg font-bold tracking-tight hidden sm:block">GitSync</h1>
          </div>

          {/* Account switcher - center on desktop */}
          <div className="flex items-center gap-2">
            {accounts && accounts.length > 0 ? (
              <div className="flex items-center gap-1.5">
                {accounts.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => setSelectedAccountId(acc.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      selectedAccountId === acc.id
                        ? "bg-primary/15 text-primary border border-primary/30"
                        : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-transparent"
                    }`}
                  >
                    {acc.avatar_url && (
                      <img src={acc.avatar_url} className="w-4 h-4 rounded-full" alt="" />
                    )}
                    <span className="hidden sm:inline">{acc.github_username}</span>
                  </button>
                ))}
                <button
                  onClick={handleConnectGitHub}
                  className="w-7 h-7 rounded-full bg-muted/30 hover:bg-muted/50 flex items-center justify-center transition-colors"
                  title="Add GitHub account"
                >
                  <Plus className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden md:block">{session.user.email}</span>
            <Button variant="ghost" size="icon" onClick={handleSignOut} className="rounded-full w-8 h-8" title="Sign out">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className={`flex-1 overflow-hidden ${isMobile ? "flex flex-col" : "grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-0"}`}>
        {/* Left / Main: Projects */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-border/20">
          {/* No GitHub account state */}
          {!accountsLoading && (!accounts || accounts.length === 0) ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center">
              <div className="w-20 h-20 rounded-2xl bg-muted/20 flex items-center justify-center">
                <Github className="w-10 h-10 text-muted-foreground/40" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h2 className="text-xl font-bold">Connect GitHub</h2>
                <p className="text-sm text-muted-foreground">
                  Link your GitHub account to start syncing repositories and managing projects.
                </p>
              </div>
              <Button onClick={handleConnectGitHub} size="lg" className="gap-2 rounded-xl">
                <Github className="w-4 h-4" />
                Connect GitHub Account
              </Button>
            </div>
          ) : (
            <>
              {/* Projects header */}
              <div className="shrink-0 px-4 md:px-6 py-4 border-b border-border/20 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground shrink-0">Projects</h2>
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-8 text-xs bg-muted/20 border-border/30 rounded-lg"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 rounded-lg text-xs h-8"
                    onClick={() => navigate("/drop")}
                  >
                    <Rocket className="w-3 h-3" />
                    <span className="hidden sm:inline">Quick Deploy</span>
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 rounded-lg text-xs h-8"
                    onClick={() => setShowCreateModal(true)}
                    disabled={!selectedAccountId}
                  >
                    <Plus className="w-3 h-3" />
                    <span className="hidden sm:inline">New Project</span>
                  </Button>
                </div>
              </div>

              {/* Projects grid */}
              <ScrollArea className="flex-1">
                <div className="p-4 md:p-6">
                  {groupsLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <Skeleton key={i} className="h-36 rounded-xl bg-muted/20" />
                      ))}
                    </div>
                  ) : filteredGroups && filteredGroups.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {filteredGroups.map((group: any) => (
                        <button
                          key={group.id}
                          onClick={() => navigate(`/project/${group.id}`)}
                          className="group text-left p-4 rounded-xl border border-border/30 bg-card/50 hover:bg-card/80 hover:border-primary/30 transition-all hover:shadow-[0_0_20px_hsl(var(--primary)/0.08)]"
                        >
                          <div className="flex items-start gap-3 mb-3">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                              <Folder className="w-5 h-5 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                                {group.name}
                              </h3>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                <GitBranch className="w-3 h-3 shrink-0" />
                                <span className="truncate">{group.mother_repo?.full_name || "—"}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <Badge variant="secondary" className="text-[10px] h-5 bg-muted/30">
                              {group.sync_group_repos?.length || 0} repos
                            </Badge>
                            {group.last_sync_time && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                {new Date(group.last_sync_time).toLocaleDateString()}
                              </span>
                            )}
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                      <div className="w-16 h-16 rounded-2xl bg-muted/15 flex items-center justify-center">
                        <Folder className="w-8 h-8 text-muted-foreground/30" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-semibold text-sm">No projects yet</h3>
                        <p className="text-xs text-muted-foreground max-w-xs">
                          Create a sync project to keep your repositories in sync automatically.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="gap-2 rounded-lg"
                        onClick={() => setShowCreateModal(true)}
                        disabled={!selectedAccountId}
                      >
                        <Plus className="w-3 h-3" />
                        Create Project
                      </Button>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        {/* Right: Activity + Account Details (hidden on mobile, shown as bottom sheet later) */}
        {!isMobile && (
          <div className="flex flex-col overflow-hidden bg-card/30">
            {/* Analytics Overview */}
            {selectedAccountId && (
              <div className="shrink-0 p-4 border-b border-border/20">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  Overview
                </h2>
                <DashboardAnalytics accountId={selectedAccountId} />
              </div>
            )}

            {/* Account card */}
            {selectedAccount && (
              <div className="shrink-0 p-4 border-b border-border/20">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 border border-border/20">
                  {selectedAccount.avatar_url && (
                    <img
                      src={selectedAccount.avatar_url}
                      className="w-10 h-10 rounded-full border border-border/30"
                      alt=""
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{selectedAccount.github_username}</p>
                    <p className="text-xs text-muted-foreground">GitHub Connected</p>
                  </div>
                  <button
                    onClick={() => handleDisconnectAccount(selectedAccount.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1.5 rounded-md hover:bg-destructive/10"
                    title="Disconnect account"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Activity */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="shrink-0 px-4 py-3 border-b border-border/20">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5" />
                  Recent Activity
                </h2>
              </div>
              <div className="flex-1 overflow-hidden">
                {selectedAccountId ? (
                  <RecentActivity accountId={selectedAccountId} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                    <Activity className="w-8 h-8 text-muted-foreground/20 mb-3" />
                    <p className="text-xs text-muted-foreground">Connect an account to see activity</p>
                  </div>
                )}
              </div>
            </div>

            {/* Credits */}
            <div className="shrink-0 border-t border-border/10 py-3 px-4">
              <div className="flex items-center justify-center gap-2">
                <img src={kennyProfile} alt="Kenny" className="w-5 h-5 rounded-full object-cover border border-border/30" />
                <p className="text-[10px] text-muted-foreground">
                  Built by <span className="font-semibold text-foreground/80">Kenny</span> · Syntax Solution
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Mobile: Activity tab at bottom */}
        {isMobile && selectedAccountId && (
          <div className="border-t border-border/30 bg-card/50 max-h-[40vh] overflow-hidden flex flex-col">
            <div className="shrink-0 px-4 py-2.5 border-b border-border/20 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" />
                Activity
              </h2>
            </div>
            <div className="flex-1 overflow-auto">
              <RecentActivity accountId={selectedAccountId} />
            </div>
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-background/95 backdrop-blur-xl border-border/50">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Create Sync Project</DialogTitle>
            <p className="text-sm text-muted-foreground">Set up automated code synchronization across repositories</p>
          </DialogHeader>
          {repos && repos.length > 0 && accountToken?.access_token && selectedAccountId && (
            <CreateSyncGroup
              accountId={selectedAccountId}
              repos={repos}
              accessToken={accountToken.access_token}
              onSuccess={() => setShowCreateModal(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
