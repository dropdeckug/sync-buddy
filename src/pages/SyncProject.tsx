import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, GitBranch, RefreshCw, GitCommit, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
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

const SyncProject = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  // Fetch sync history
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
        () => {
          refetchHistory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [syncGroup?.account_id, refetchHistory]);

  const handleSync = async () => {
    if (!syncGroup) return;

    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-repos", {
        body: {
          syncGroupId: id,
          accountId: syncGroup.account_id,
          motherRepoId: syncGroup.mother_repo_id,
        },
      });

      if (error) throw error;

      toast({
        title: "Sync started",
        description: "Syncing repositories in the background...",
      });

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
    } finally {
      setIsSyncing(false);
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
                <span className="font-medium">{syncGroup.mother_repo.name}</span>
                <Badge>{syncGroup.mother_repo.default_branch}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{syncGroup.mother_repo.full_name}</p>
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
                <div>
                  <p className="font-medium">{cr.repo.name}</p>
                  <p className="text-sm text-muted-foreground">{cr.repo.full_name}</p>
                </div>
                <Badge>{cr.repo.default_branch}</Badge>
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
                    <div>
                      <p className="font-medium">{history.repo_name}</p>
                      <p className="text-sm text-muted-foreground">{history.commit_message}</p>
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
    </div>
  );
};

export default SyncProject;
