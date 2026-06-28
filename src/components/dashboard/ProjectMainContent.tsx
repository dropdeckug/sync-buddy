import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  GitBranch, Eye, RefreshCw, GitCommit, ExternalLink,
  ArrowDown, Shield, Clock, Zap, CheckCircle2, AlertTriangle,
  Loader2, Activity, RefreshCcwDot
} from "lucide-react";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WebhookStatusIndicator } from "@/components/dashboard/WebhookManager";

function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface ProjectMainContentProps {
  isLoading?: boolean;
  syncGroup?: any;
  childRepos?: any[];
  commits?: any[];
  loadingCommits?: boolean;
  accessToken?: string;
  autoSyncEnabled?: boolean;
  onToggleAutoSync: (enabled: boolean) => void;
  onViewRepo: (repo: any) => void;
  onChangeMother: () => void;
}

export function ProjectMainContent({
  isLoading,
  syncGroup,
  childRepos,
  commits,
  loadingCommits,
  accessToken,
  autoSyncEnabled,
  onToggleAutoSync,
  onViewRepo,
  onChangeMother,
}: ProjectMainContentProps) {
  const [commitTab, setCommitTab] = useState<"changes" | "synced">("changes");

  // Sync health: look at the most recent sync attempts for this group.
  const { data: healthRecords } = useQuery({
    queryKey: ["sync-health", syncGroup?.id],
    queryFn: async () => {
      if (!syncGroup?.id) return [];
      const { data } = await supabase
        .from("sync_progress")
        .select("status, error_message, updated_at")
        .eq("sync_group_id", syncGroup.id)
        .order("updated_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!syncGroup?.id,
    refetchInterval: 15000,
  });

  const health = useMemo(() => {
    const recs = healthRecords || [];
    const syncing = recs.some((r: any) => r.status === "syncing");
    const recentFails = recs.filter((r: any) => r.status === "failed").length;
    const recentOk = recs.filter((r: any) => r.status === "completed").length;
    let state: "healthy" | "syncing" | "warning" | "idle" = "idle";
    if (syncing) state = "syncing";
    else if (recentFails > 0 && recentFails >= recentOk) state = "warning";
    else if (recentOk > 0) state = "healthy";
    return { state, recentFails, recentOk, syncing };
  }, [healthRecords]);

  // Separate real changes from system "Synced from ..." mirror commits.
  const { changeCommits, syncedCommits } = useMemo(() => {
    const all = commits || [];
    const isSyncCommit = (c: any) =>
      (c?.commit?.message || "").startsWith("Synced from ");
    return {
      changeCommits: all.filter((c: any) => !isSyncCommit(c)),
      syncedCommits: all.filter((c: any) => isSyncCommit(c)),
    };
  }, [commits]);

  if (isLoading) {
    return (
      <main className="flex-1 min-w-0 bg-card/50 border border-border/30 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-border/30">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="p-6 space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      </main>
    );
  }

  if (!syncGroup) {
    return (
      <main className="flex-1 min-w-0 bg-card/50 border border-border/30 rounded-2xl flex items-center justify-center">
        <div className="text-center">
          <GitBranch className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-muted-foreground">Project not found</h2>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 min-w-0 bg-card/50 md:border border-border/30 md:rounded-2xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-border/30">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">{syncGroup.name}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {childRepos?.length || 0} repositories synced from{" "}
              <span className="text-primary font-medium">{syncGroup.mother_repo?.name}</span>
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 rounded-lg border border-border/30">
              <Zap className={`w-3.5 h-3.5 ${autoSyncEnabled !== false ? "text-primary" : "text-muted-foreground"}`} />
              <Label htmlFor="auto-sync-main" className="text-xs cursor-pointer font-medium">Auto-sync</Label>
              <Switch
                id="auto-sync-main"
                checked={autoSyncEnabled !== false}
                onCheckedChange={onToggleAutoSync}
                className="scale-75"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Sync Health Strip */}
      <div className="px-4 sm:px-6 py-2.5 border-b border-border/30 bg-muted/10 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          {health.state === "syncing" ? (
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
          ) : health.state === "warning" ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          ) : health.state === "healthy" ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
          ) : (
            <Activity className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <span className="text-xs font-medium">
            {health.state === "syncing"
              ? "Syncing now…"
              : health.state === "warning"
              ? "Needs attention"
              : health.state === "healthy"
              ? "Healthy"
              : "Idle"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          Last sync: <span className="text-foreground font-medium">{timeAgo(syncGroup.last_sync_time)}</span>
        </div>
        {(health.recentOk > 0 || health.recentFails > 0) && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {health.recentOk > 0 && (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-primary" /> {health.recentOk} ok
              </span>
            )}
            {health.recentFails > 0 && (
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-500" /> {health.recentFails} failed
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 space-y-6">
          {/* Mother Repository */}
          <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/8 to-transparent">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                  <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-primary/15 flex items-center justify-center border border-primary/20 shrink-0">
                    <GitBranch className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm sm:text-base truncate">{syncGroup.mother_repo.name}</h3>
                      <Badge className="text-[10px] bg-primary/15 text-primary border-primary/20 px-1.5">Source</Badge>
                      {syncGroup.mother_repo.is_private && (
                        <Badge variant="outline" className="text-[10px] px-1.5 gap-1">
                          <Shield className="w-2.5 h-2.5" /> Private
                        </Badge>
                      )}
                      {accessToken && (
                        <WebhookStatusIndicator
                          repoFullName={syncGroup.mother_repo.full_name}
                          accessToken={accessToken}
                        />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{syncGroup.mother_repo.full_name}</p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <Badge variant="secondary" className="text-[10px]">{syncGroup.mother_repo.default_branch}</Badge>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {syncGroup.last_sync_time
                          ? `Last sync: ${new Date(syncGroup.last_sync_time).toLocaleDateString()}`
                          : "Never synced"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <Button variant="secondary" size="sm" className="h-8 text-xs rounded-lg gap-1.5" onClick={() => onViewRepo(syncGroup.mother_repo)}>
                  <Eye className="h-3.5 w-3.5" /> Browse
                </Button>
                <Button variant="secondary" size="sm" className="h-8 text-xs rounded-lg gap-1.5"
                  onClick={() => window.open(`https://github.com/${syncGroup.mother_repo.full_name}`, '_blank')}>
                  <ExternalLink className="h-3.5 w-3.5" /> GitHub
                </Button>
                <Button variant="secondary" size="sm" className="h-8 text-xs rounded-lg gap-1.5" onClick={onChangeMother}>
                  <RefreshCw className="h-3.5 w-3.5" /> Change
                </Button>
              </div>
            </div>
          </div>

          {/* Sync Flow Arrow */}
          {childRepos && childRepos.length > 0 && (
            <div className="flex justify-center">
              <div className="flex flex-col items-center gap-1">
                <ArrowDown className="w-4 h-4 text-primary/60 animate-pulse" />
                <span className="text-[10px] text-muted-foreground font-medium">syncs to {childRepos.length} repos</span>
              </div>
            </div>
          )}

          {/* Child Repositories Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                Child Repositories
                <Badge variant="secondary" className="text-[10px]">{childRepos?.length || 0}</Badge>
              </h3>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {childRepos?.map((cr) => (
                <div
                  key={cr.id}
                  className="group p-3.5 rounded-xl bg-muted/20 border border-border/30 hover:border-primary/20 hover:bg-muted/30 transition-all"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate">{cr.repo.name}</p>
                          {accessToken && (
                            <WebhookStatusIndicator
                              repoFullName={cr.repo.full_name}
                              accessToken={accessToken}
                            />
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">{cr.repo.full_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg" onClick={() => onViewRepo(cr.repo)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg"
                        onClick={() => window.open(`https://github.com/${cr.repo.full_name}`, '_blank')}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {(!childRepos || childRepos.length === 0) && (
                <div className="col-span-1 lg:col-span-2 text-center py-10 text-muted-foreground">
                  <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No child repositories yet</p>
                </div>
              )}
            </div>
          </div>

          <Separator className="bg-border/20" />

          {/* Commits — separated into real changes vs system sync commits */}
          <div>
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <GitCommit className="h-4 w-4 text-muted-foreground" />
                Commits
              </h3>
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/30 border border-border/30">
                <button
                  onClick={() => setCommitTab("changes")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors ${
                    commitTab === "changes" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <GitCommit className="w-3 h-3" /> Changes
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">{changeCommits.length}</Badge>
                </button>
                <button
                  onClick={() => setCommitTab("synced")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors ${
                    commitTab === "synced" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <RefreshCcwDot className="w-3 h-3" /> Synced
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">{syncedCommits.length}</Badge>
                </button>
              </div>
            </div>

            {loadingCommits ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
              </div>
            ) : (() => {
              const list = (commitTab === "changes" ? changeCommits : syncedCommits).slice(0, 15);
              if (list.length === 0) {
                return (
                  <div className="text-center py-10 text-muted-foreground">
                    <GitCommit className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">
                      {commitTab === "changes" ? "No source commits found" : "No synced commits yet"}
                    </p>
                  </div>
                );
              }
              return (
                <div className="space-y-1.5">
                  {list.map((commit: any, idx: number) => {
                    const url =
                      commit.html_url ||
                      (commit.repo_full_name ? `https://github.com/${commit.repo_full_name}/commit/${commit.sha}` : undefined);
                    const isSync = commitTab === "synced";
                    return (
                      <button
                        key={idx}
                        onClick={() => url && window.open(url, "_blank")}
                        className={`w-full text-left p-3 rounded-xl border transition-all hover:border-primary/30 cursor-pointer ${
                          isSync
                            ? "bg-primary/5 border-primary/15"
                            : "bg-muted/15 border-border/20 hover:border-border/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate flex items-center gap-1.5">
                              {isSync && <RefreshCcwDot className="w-3 h-3 text-primary shrink-0" />}
                              {commit.commit.message.split("\n")[0]}
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-[10px] text-muted-foreground">{commit.commit.author.name}</span>
                              <span className="text-[10px] text-muted-foreground">•</span>
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-normal">{commit.repo_name}</Badge>
                              <span className="text-[10px] text-muted-foreground">•</span>
                              <span className="text-[10px] text-muted-foreground">
                                {timeAgo(commit.commit.author.date)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 h-5">
                              {commit.sha.substring(0, 7)}
                            </Badge>
                            <ExternalLink className="w-3 h-3 text-muted-foreground" />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      </ScrollArea>
    </main>
  );
}
