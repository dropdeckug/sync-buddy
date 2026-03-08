import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  GitBranch, Eye, RefreshCw, GitCommit, ExternalLink,
  ArrowDown, Shield, Clock, Zap
} from "lucide-react";
import { WebhookStatusIndicator } from "@/components/dashboard/WebhookManager";

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
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                <div className="col-span-2 text-center py-10 text-muted-foreground">
                  <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No child repositories yet</p>
                </div>
              )}
            </div>
          </div>

          <Separator className="bg-border/20" />

          {/* Recent Commits */}
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <GitCommit className="h-4 w-4 text-muted-foreground" />
              Recent Commits
            </h3>
            {loadingCommits ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
              </div>
            ) : commits && commits.length > 0 ? (
              <div className="space-y-1.5">
                {commits.slice(0, 10).map((commit: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-muted/15 border border-border/20 hover:border-border/40 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{commit.commit.message.split('\n')[0]}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground">{commit.commit.author.name}</span>
                          <span className="text-[10px] text-muted-foreground">•</span>
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-normal">{commit.repo_name}</Badge>
                          <span className="text-[10px] text-muted-foreground">•</span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(commit.commit.author.date).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0 font-mono text-[10px] px-1.5 py-0 h-5">
                        {commit.sha.substring(0, 7)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <GitCommit className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No commits found</p>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </main>
  );
}
