import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  GitPullRequest,
  GitMerge,
  XCircle,
  ExternalLink,
  Loader2,
  Settings,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type PRStatus = 'open' | 'merged' | 'closed';

interface SyncPullRequest {
  id: string;
  sync_group_id: string;
  repo_full_name: string;
  pr_number: number;
  pr_url: string;
  title: string;
  status: PRStatus;
  created_at: string;
  merged_at: string | null;
  closed_at: string | null;
}

interface SyncGroup {
  id: string;
  name: string;
  sync_via_pr: boolean;
  pr_branch_prefix: string;
}

interface PRSyncManagerProps {
  syncGroupId: string;
  accessToken: string;
}

const statusConfig = {
  open: {
    icon: GitPullRequest,
    color: "bg-green-500/20 text-green-500",
    label: "Open",
  },
  merged: {
    icon: GitMerge,
    color: "bg-purple-500/20 text-purple-500",
    label: "Merged",
  },
  closed: {
    icon: XCircle,
    color: "bg-gray-500/20 text-gray-500",
    label: "Closed",
  },
};

export function PRSyncManager({ syncGroupId, accessToken }: PRSyncManagerProps) {
  const [pullRequests, setPullRequests] = useState<SyncPullRequest[]>([]);
  const [syncGroup, setSyncGroup] = useState<SyncGroup | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [branchPrefix, setBranchPrefix] = useState("sync/");
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, [syncGroupId]);

  const fetchData = async () => {
    try {
      const [groupRes, prsRes] = await Promise.all([
        supabase
          .from("sync_groups")
          .select("id, name, sync_via_pr, pr_branch_prefix")
          .eq("id", syncGroupId)
          .single(),
        supabase
          .from("sync_pull_requests")
          .select("*")
          .eq("sync_group_id", syncGroupId)
          .order("created_at", { ascending: false }),
      ]);

      if (groupRes.error) throw groupRes.error;
      if (prsRes.error) throw prsRes.error;

      setSyncGroup(groupRes.data);
      setBranchPrefix(groupRes.data.pr_branch_prefix || "sync/");
      setPullRequests((prsRes.data || []) as SyncPullRequest[]);
    } catch (error: any) {
      toast({
        title: "Error fetching data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const togglePRMode = async () => {
    if (!syncGroup) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("sync_groups")
        .update({ sync_via_pr: !syncGroup.sync_via_pr })
        .eq("id", syncGroupId);

      if (error) throw error;

      setSyncGroup(prev => prev ? { ...prev, sync_via_pr: !prev.sync_via_pr } : null);

      toast({
        title: syncGroup.sync_via_pr ? "Direct sync enabled" : "PR mode enabled",
        description: syncGroup.sync_via_pr
          ? "Changes will be synced directly to repositories"
          : "Changes will create pull requests for review",
      });
    } catch (error: any) {
      toast({
        title: "Error updating settings",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const saveBranchPrefix = async () => {
    if (!syncGroup || !branchPrefix.trim()) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("sync_groups")
        .update({ pr_branch_prefix: branchPrefix })
        .eq("id", syncGroupId);

      if (error) throw error;

      setSyncGroup(prev => prev ? { ...prev, pr_branch_prefix: branchPrefix } : null);

      toast({
        title: "Branch prefix updated",
        description: `New branches will use "${branchPrefix}" prefix`,
      });
    } catch (error: any) {
      toast({
        title: "Error updating prefix",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const refreshPRStatus = async () => {
    setIsLoading(true);
    try {
      // Call edge function to refresh PR statuses from GitHub
      const { error } = await supabase.functions.invoke("refresh-pr-status", {
        body: { syncGroupId, accessToken },
      });

      if (error) throw error;

      await fetchData();

      toast({
        title: "Status refreshed",
        description: "Pull request statuses have been updated",
      });
    } catch (error: any) {
      toast({
        title: "Error refreshing status",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openPRs = pullRequests.filter(pr => pr.status === 'open');
  const mergedPRs = pullRequests.filter(pr => pr.status === 'merged');
  const closedPRs = pullRequests.filter(pr => pr.status === 'closed');

  if (isLoading && !syncGroup) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <GitPullRequest className="h-6 w-6" />
            PR-Based Syncing
          </h2>
          <p className="text-muted-foreground">
            Create pull requests instead of direct commits for review workflow
          </p>
        </div>
        <Button variant="outline" onClick={refreshPRStatus} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh Status
        </Button>
      </div>

      {/* Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            PR Settings
          </CardTitle>
          <CardDescription>
            Configure how syncs create pull requests
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="pr-mode">Enable PR Mode</Label>
              <p className="text-sm text-muted-foreground">
                When enabled, syncs will create PRs instead of committing directly
              </p>
            </div>
            <Switch
              id="pr-mode"
              checked={syncGroup?.sync_via_pr || false}
              onCheckedChange={togglePRMode}
              disabled={isSaving}
            />
          </div>

          {syncGroup?.sync_via_pr && (
            <div className="space-y-2">
              <Label htmlFor="branch-prefix">Branch Prefix</Label>
              <div className="flex gap-2">
                <Input
                  id="branch-prefix"
                  value={branchPrefix}
                  onChange={(e) => setBranchPrefix(e.target.value)}
                  placeholder="sync/"
                  className="max-w-[200px]"
                />
                <Button
                  variant="outline"
                  onClick={saveBranchPrefix}
                  disabled={isSaving || branchPrefix === syncGroup.pr_branch_prefix}
                >
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Branches will be named like: {branchPrefix}
                {new Date().toISOString().split('T')[0]}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open PRs</p>
                <p className="text-3xl font-bold">{openPRs.length}</p>
              </div>
              <GitPullRequest className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Merged</p>
                <p className="text-3xl font-bold">{mergedPRs.length}</p>
              </div>
              <GitMerge className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Closed</p>
                <p className="text-3xl font-bold">{closedPRs.length}</p>
              </div>
              <XCircle className="h-8 w-8 text-gray-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pull Requests List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Pull Requests</CardTitle>
          <CardDescription>
            Pull requests created by sync operations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pullRequests.length === 0 ? (
            <div className="text-center py-12">
              <GitPullRequest className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No pull requests yet</h3>
              <p className="text-muted-foreground">
                {syncGroup?.sync_via_pr
                  ? "Run a sync to create your first PR"
                  : "Enable PR mode to start creating pull requests"}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {pullRequests.map((pr) => {
                  const config = statusConfig[pr.status];
                  const StatusIcon = config.icon;

                  return (
                    <div
                      key={pr.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${config.color}`}>
                          <StatusIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{pr.title}</p>
                            <Badge className={config.color}>
                              {config.label}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {pr.repo_full_name} • #{pr.pr_number}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Created {formatDistanceToNow(new Date(pr.created_at), { addSuffix: true })}
                            {pr.merged_at && (
                              <> • Merged {formatDistanceToNow(new Date(pr.merged_at), { addSuffix: true })}</>
                            )}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(pr.pr_url, "_blank")}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        View PR
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
