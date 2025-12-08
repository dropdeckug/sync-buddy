import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, GitBranch, RefreshCw, GitCommit, Trash2, Eye, Plus, Webhook } from "lucide-react";
import RepositoryBrowser from "@/components/dashboard/RepositoryBrowser";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { AddReposToGroup } from "@/components/dashboard/AddReposToGroup";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SyncProgressModal } from "@/components/dashboard/SyncProgressModal";
import { WebhookManager, WebhookStatusIndicator } from "@/components/dashboard/WebhookManager";

const SyncProject = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [viewingRepo, setViewingRepo] = useState<any>(null);
  const [showAddRepos, setShowAddRepos] = useState(false);
  const [showChangeMotherRepo, setShowChangeMotherRepo] = useState(false);
  const [selectedMotherRepoId, setSelectedMotherRepoId] = useState<string>("");
  const [syncRepos, setSyncRepos] = useState<any[]>([]);
  const [showWebhookManager, setShowWebhookManager] = useState(false);

  // Fetch sync group details
  const { data: syncGroup, isLoading: loadingGroup, refetch: refetchGroup } = useQuery({
    queryKey: ["sync-group", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_groups")
        .select(`
          *,
          mother_repo:repos!sync_groups_mother_repo_id_fkey(*)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch child repositories
  const { data: childRepos, isLoading: loadingRepos, refetch: refetchRepos } = useQuery({
    queryKey: ["sync-group-repos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_group_repos")
        .select(`
          *,
          repo:repos(*)
        `)
        .eq("sync_group_id", id);

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch all available repos for adding
  const { data: allRepos } = useQuery({
    queryKey: ["all-repos", syncGroup?.account_id],
    queryFn: async () => {
      if (!syncGroup?.account_id) return [];
      
      const response = await supabase.functions.invoke("github-repos", {
        body: { accountId: syncGroup.account_id },
      });

      return response.data?.repos || [];
    },
    enabled: !!syncGroup?.account_id,
  });

  // Fetch account access token for webhook registration
  const { data: accountData } = useQuery({
    queryKey: ["github-account-token", syncGroup?.account_id],
    queryFn: async () => {
      if (!syncGroup?.account_id) return null;
      const { data } = await supabase
        .from("github_accounts")
        .select("access_token")
        .eq("id", syncGroup.account_id)
        .single();
      return data;
    },
    enabled: !!syncGroup?.account_id,
  });
  const { data: syncHistory, isLoading: loadingHistory, refetch: refetchHistory } = useQuery({
    queryKey: ["sync-history", syncGroup?.account_id],
    queryFn: async () => {
      if (!syncGroup?.account_id) return [];
      
      const { data, error } = await supabase
        .from("sync_history")
        .select("*")
        .eq("account_id", syncGroup.account_id)
        .order("synced_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data;
    },
    enabled: !!syncGroup?.account_id,
  });

  // Fetch commits from all repos
  const { data: commits, isLoading: loadingCommits, refetch: refetchCommits } = useQuery({
    queryKey: ["repo-commits", id],
    queryFn: async () => {
      if (!syncGroup?.account_id) return [];

      const allRepos = [
        syncGroup.mother_repo,
        ...(childRepos?.map(cr => cr.repo) || [])
      ].filter(Boolean);

      const commitsPromises = allRepos.map(async (repo: any) => {
        const { data, error } = await supabase.functions.invoke("get-commits", {
          body: {
            accountId: syncGroup.account_id,
            repoFullName: repo.full_name,
          },
        });

        if (error) {
          console.error(`Error fetching commits for ${repo.full_name}:`, error);
          return [];
        }

        return (data || []).map((commit: any) => ({
          ...commit,
          repo_name: repo.name,
          repo_full_name: repo.full_name,
        }));
      });

      const results = await Promise.all(commitsPromises);
      return results.flat().sort((a, b) => 
        new Date(b.commit.author.date).getTime() - new Date(a.commit.author.date).getTime()
      );
    },
    enabled: !!syncGroup && !!childRepos,
  });

  // Setup realtime subscription for sync history
  useEffect(() => {
    if (!syncGroup?.account_id) return;

    const channel = supabase
      .channel("sync-history-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sync_history",
          filter: `account_id=eq.${syncGroup.account_id}`,
        },
        (payload) => {
          refetchHistory();
          // Alert on new sync activity
          if (payload.eventType === 'INSERT') {
            const record = payload.new as any;
            if (record.status === 'failed') {
              toast({
                title: "Sync Failed",
                description: `Failed to sync ${record.repo_name}: ${record.error_message}`,
                variant: "destructive",
              });
            } else if (record.status === 'success') {
              toast({
                title: "Sync Completed",
                description: `${record.repo_name}: +${record.files_added} ~${record.files_changed} -${record.files_deleted} files`,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [syncGroup?.account_id, refetchHistory, toast]);

  const handleSync = async () => {
    if (!syncGroup || !childRepos) return;

    setIsSyncing(true);
    
    // Prepare repos for sync progress modal
    const reposForSync = childRepos.map(cr => ({
      name: cr.repo.name,
      full_name: cr.repo.full_name,
      status: 'pending' as const,
    }));
    setSyncRepos(reposForSync);
    setShowSyncModal(true);

    try {
      const { data, error } = await supabase.functions.invoke("sync-repos", {
        body: {
          syncGroupId: id,
          accountId: syncGroup.account_id,
        },
      });

      if (error) throw error;

      // Check if there were no new commits to sync
      if (data?.message === 'No new commits to sync') {
        toast({
          title: "Already Up to Date",
          description: "All repositories are already synced with the latest commits.",
        });
        setShowSyncModal(false);
      }

      // Refetch all data
      refetchGroup();
      refetchRepos();
      refetchHistory();
      refetchCommits();
    } catch (error: any) {
      toast({
        title: "Sync failed",
        description: error.message,
        variant: "destructive",
      });
      setShowSyncModal(false);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleChangeMotherRepo = async () => {
    if (!selectedMotherRepoId || !id) return;

    try {
      const { error } = await supabase
        .from("sync_groups")
        .update({ mother_repo_id: selectedMotherRepoId })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Mother Repository Updated",
        description: "The mother repository has been successfully changed.",
      });

      setShowChangeMotherRepo(false);
      refetchGroup();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteProject = async () => {
    if (!id) return;
    
    setIsDeleting(true);
    try {
      // Delete sync group repos first
      const { error: reposError } = await supabase
        .from("sync_group_repos")
        .delete()
        .eq("sync_group_id", id);

      if (reposError) throw reposError;

      // Delete sync group
      const { error: groupError } = await supabase
        .from("sync_groups")
        .delete()
        .eq("id", id);

      if (groupError) throw groupError;

      toast({
        title: "Project Disconnected",
        description: "The sync project has been successfully deleted.",
      });

      navigate("/");
    } catch (error) {
      console.error("Error deleting project:", error);
      toast({
        title: "Error",
        description: "Failed to delete the project. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (loadingGroup || loadingRepos) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!syncGroup) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Project not found</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{syncGroup.name}</h1>
            <p className="text-muted-foreground">Sync Project Details</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowWebhookManager(true)} variant="outline">
            <Webhook className="h-4 w-4 mr-2" />
            Webhooks
          </Button>
          <Button onClick={() => setShowAddRepos(true)} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Add Repos
          </Button>
          <Button onClick={handleSync} disabled={isSyncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync Now"}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isDeleting}>
                <Trash2 className="w-4 h-4 mr-2" />
                Disconnect
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect Sync Project?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this sync project and stop all synchronization.
                  Your GitHub repositories will remain intact, but syncing between them will stop.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteProject} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete Project
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Mother Repository
          </CardTitle>
          <CardDescription>Source repository for syncing</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium">{syncGroup.mother_repo.name}</span>
                {accountData?.access_token && (
                  <WebhookStatusIndicator 
                    repoFullName={syncGroup.mother_repo.full_name} 
                    accessToken={accountData.access_token} 
                  />
                )}
              </div>
              <Badge>{syncGroup.mother_repo.default_branch}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{syncGroup.mother_repo.full_name}</p>
            <div className="flex gap-2 mt-3">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setViewingRepo(syncGroup.mother_repo)}
              >
                <Eye className="h-4 w-4 mr-2" />
                Browse Files
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.open(`https://github.com/${syncGroup.mother_repo.full_name}`, '_blank')}
              >
                Open on GitHub
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setSelectedMotherRepoId(syncGroup.mother_repo_id);
                  setShowChangeMotherRepo(true);
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Change
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sync Information</CardTitle>
            <CardDescription>Project sync details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Child Repositories:</span>
              <span className="font-medium">{childRepos?.length || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Last Sync:</span>
              <span className="font-medium">
                {syncGroup.last_sync_time
                  ? new Date(syncGroup.last_sync_time).toLocaleString()
                  : "Never"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Sync Mode:</span>
              <Badge variant="outline">{syncGroup.sync_mode}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Child Repositories</CardTitle>
          <CardDescription>Repositories that will be synced with the mother repository</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {childRepos?.map((cr) => (
              <div
                key={cr.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{cr.repo.name}</p>
                    {accountData?.access_token && (
                      <WebhookStatusIndicator 
                        repoFullName={cr.repo.full_name} 
                        accessToken={accountData.access_token} 
                      />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{cr.repo.full_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{cr.repo.default_branch}</Badge>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setViewingRepo(cr.repo)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Browse
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.open(`https://github.com/${cr.repo.full_name}`, '_blank')}
                  >
                    GitHub
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCommit className="h-5 w-5" />
            Recent Commits
          </CardTitle>
          <CardDescription>All commits across project repositories</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingCommits ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : commits && commits.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {commits.map((commit: any, idx: number) => (
                <div key={idx} className="p-4 border rounded-lg space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium">{commit.commit.message.split('\n')[0]}</p>
                      <p className="text-sm text-muted-foreground">
                        {commit.commit.author.name} • {commit.repo_name}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {commit.sha.substring(0, 7)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(commit.commit.author.date).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No commits found</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sync History</CardTitle>
          <CardDescription>Recent synchronization operations</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : syncHistory && syncHistory.length > 0 ? (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {syncHistory.map((history) => (
                <div key={history.id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{history.repo_name}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => window.open(`https://github.com/${history.repo_full_name}`, '_blank')}
                        >
                          View Repo
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">{history.commit_message}</p>
                      {history.error_message && (
                        <p className="text-sm text-destructive mt-1">{history.error_message}</p>
                      )}
                    </div>
                    <Badge variant={history.status === "success" ? "default" : "destructive"}>
                      {history.status}
                    </Badge>
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                    <span>Added: {history.files_added}</span>
                    <span>Changed: {history.files_changed}</span>
                    <span>Deleted: {history.files_deleted}</span>
                    <span>{new Date(history.synced_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No sync history yet</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={showChangeMotherRepo} onOpenChange={setShowChangeMotherRepo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Mother Repository</DialogTitle>
            <DialogDescription>
              Select a new mother repository for this sync project. The selected repository will become the source for syncing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="mother-repo-select">Mother Repository</Label>
              <Select
                value={selectedMotherRepoId}
                onValueChange={setSelectedMotherRepoId}
              >
                <SelectTrigger id="mother-repo-select">
                  <SelectValue placeholder="Select a repository" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={syncGroup.mother_repo.id}>
                    {syncGroup.mother_repo.full_name} (Current)
                  </SelectItem>
                  {childRepos?.map((cr) => (
                    <SelectItem key={cr.repo.id} value={cr.repo.id}>
                      {cr.repo.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChangeMotherRepo(false)}>
              Cancel
            </Button>
            <Button onClick={handleChangeMotherRepo}>
              Change Mother Repository
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SyncProgressModal
        open={showSyncModal}
        onOpenChange={setShowSyncModal}
        syncGroupId={id!}
        accountId={syncGroup.account_id}
        initialRepos={syncRepos}
      />

      <AddReposToGroup
        open={showAddRepos}
        onOpenChange={setShowAddRepos}
        syncGroupId={id!}
        accountId={syncGroup.account_id}
        motherRepoId={syncGroup.mother_repo_id}
        existingRepoIds={[
          syncGroup.mother_repo.github_id,
          ...(childRepos?.map(cr => cr.repo.github_id) || [])
        ]}
        availableRepos={allRepos || []}
        accessToken={accountData?.access_token || ''}
      />

      <Dialog open={showWebhookManager} onOpenChange={setShowWebhookManager}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Webhook Management
            </DialogTitle>
            <DialogDescription>
              Manage GitHub webhooks for automatic syncing. All repositories need webhooks registered for bidirectional sync to work.
            </DialogDescription>
          </DialogHeader>
          {accountData?.access_token && (
            <WebhookManager
              repos={[
                syncGroup.mother_repo,
                ...(childRepos?.map(cr => cr.repo) || [])
              ]}
              accessToken={accountData.access_token}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingRepo} onOpenChange={() => setViewingRepo(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Browse Repository: {viewingRepo?.name}</DialogTitle>
          </DialogHeader>
          {viewingRepo && (
            <RepositoryBrowser
              accountId={syncGroup.account_id}
              repoId={viewingRepo.id}
              repoName={viewingRepo.name}
              repoFullName={viewingRepo.full_name}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SyncProject;
