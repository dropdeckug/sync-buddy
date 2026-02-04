import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GitBranch, Eye, RefreshCw, GitCommit } from "lucide-react";
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
      <main className="flex-1 min-w-0 bg-card rounded-xl overflow-hidden">
        {/* Header Skeleton */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-10 w-28" />
          </div>
        </div>

        {/* Content Skeleton */}
        <ScrollArea className="h-[calc(100vh-180px)]">
          <div className="p-6 space-y-6">
            {/* Mother Repo Card Skeleton */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-28" />
                <Skeleton className="h-9 w-28" />
              </div>
            </div>

            {/* Child Repos Skeleton */}
            <div className="space-y-3">
              <Skeleton className="h-5 w-32" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-xl bg-muted/30 border border-border">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-36" />
                      <Skeleton className="h-4 w-48" />
                    </div>
                    <div className="flex gap-2">
                      <Skeleton className="h-9 w-20" />
                      <Skeleton className="h-9 w-20" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Commits Skeleton */}
            <div className="space-y-3">
              <Skeleton className="h-5 w-32" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-xl bg-muted/30 border border-border space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      </main>
    );
  }

  if (!syncGroup) {
    return (
      <main className="flex-1 min-w-0 bg-card rounded-xl flex items-center justify-center">
        <div className="text-center">
          <GitBranch className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-muted-foreground">Project not found</h2>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 min-w-0 bg-card rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{syncGroup.name}</h1>
            <p className="text-muted-foreground">Manage your sync project repositories</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="auto-sync-main"
                checked={autoSyncEnabled !== false}
                onCheckedChange={onToggleAutoSync}
              />
              <Label htmlFor="auto-sync-main" className="text-sm cursor-pointer">
                Auto-sync
              </Label>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Mother Repository Card */}
          <div className="p-5 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <GitBranch className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{syncGroup.mother_repo.name}</h3>
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                      Mother
                    </Badge>
                    {accessToken && (
                      <WebhookStatusIndicator
                        repoFullName={syncGroup.mother_repo.full_name}
                        accessToken={accessToken}
                      />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{syncGroup.mother_repo.full_name}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{syncGroup.mother_repo.default_branch}</Badge>
                    <span>Last sync: {syncGroup.last_sync_time 
                      ? new Date(syncGroup.last_sync_time).toLocaleDateString() 
                      : "Never"}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="secondary" size="sm" onClick={() => onViewRepo(syncGroup.mother_repo)}>
                <Eye className="h-4 w-4 mr-2" />
                Browse Files
              </Button>
              <Button 
                variant="secondary" 
                size="sm"
                onClick={() => window.open(`https://github.com/${syncGroup.mother_repo.full_name}`, '_blank')}
              >
                Open on GitHub
              </Button>
              <Button variant="secondary" size="sm" onClick={onChangeMother}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Change
              </Button>
            </div>
          </div>

          {/* Child Repositories */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              Child Repositories
              <Badge variant="secondary">{childRepos?.length || 0}</Badge>
            </h3>
            <div className="space-y-3">
              {childRepos?.map((cr) => (
                <div
                  key={cr.id}
                  className="p-4 rounded-xl bg-muted/30 border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{cr.repo.name}</p>
                        {accessToken && (
                          <WebhookStatusIndicator
                            repoFullName={cr.repo.full_name}
                            accessToken={accessToken}
                          />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{cr.repo.full_name}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline">{cr.repo.default_branch}</Badge>
                      <Button variant="ghost" size="sm" onClick={() => onViewRepo(cr.repo)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Browse
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => window.open(`https://github.com/${cr.repo.full_name}`, '_blank')}
                      >
                        GitHub
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {(!childRepos || childRepos.length === 0) && (
                <div className="text-center py-8 text-muted-foreground">
                  No child repositories added yet
                </div>
              )}
            </div>
          </div>

          {/* Recent Commits */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <GitCommit className="h-5 w-5" />
              Recent Commits
            </h3>
            {loadingCommits ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4 rounded-xl bg-muted/30 border border-border space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                ))}
              </div>
            ) : commits && commits.length > 0 ? (
              <div className="space-y-2">
                {commits.slice(0, 10).map((commit: any, idx: number) => (
                  <div 
                    key={idx} 
                    className="p-4 rounded-xl bg-muted/30 border border-border hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{commit.commit.message.split('\n')[0]}</p>
                        <p className="text-sm text-muted-foreground">
                          {commit.commit.author.name} • {commit.repo_name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(commit.commit.author.date).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0 font-mono text-xs">
                        {commit.sha.substring(0, 7)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No commits found
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </main>
  );
}
