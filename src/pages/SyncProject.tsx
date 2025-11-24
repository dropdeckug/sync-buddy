import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, GitBranch, RefreshCw, GitCommit, Trash2, Eye, Plus } from "lucide-react";
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
        (payload) => {
          refetchHistory();
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
          motherRepoId: syncGroup.mother_repo_id,
        },
      });

      if (error) throw error;

      if (data?.message === 'No new commits to sync') {
        toast({
          title: "Already Up to Date",
          description: "All repositories are already synced with the latest commits.",
        });
        setShowSyncModal(false);
      }

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
      const { error: reposError } = await supabase
        .from("sync_group_repos")
        .delete()
        .eq("sync_group_id", id);

      if (reposError) throw reposError;

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
    <div className="min-h-screen bg-gradient-to-b from-background to-background/95 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with gradient background */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/20 p-8">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtNi42MjcgMC0xMiA1LjM3My0xMiAxMnM1LjM3MyAxMiAxMiAxMiAxMi01LjM3MyAxMi0xMi01LjM3My0xMi0xMi0xMnoiIHN0cm9rZT0iaHNsKDE0MiA3NiUgMzYlKSIgc3Ryb2tlLXdpZHRoPSIwLjUiIG9wYWNpdHk9IjAuMSIvPjwvZz48L3N2Zz4=')] opacity-30" />
          <div className="relative flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="hover:bg-background/50">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">{syncGroup.name}</h1>
                <p className="text-muted-foreground mt-1">Manage and sync your GitHub repositories</p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => setShowAddRepos(true)} variant="outline" className="bg-background/50 backdrop-blur-sm hover:bg-background/80">
                <Plus className="h-4 w-4 mr-2" />
                Add Repositories
              </Button>
              <Button onClick={handleSync} disabled={isSyncing} className="bg-primary hover:bg-primary/90 shadow-glow">
                <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing..." : "Sync Now"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={isDeleting} className="shadow-lg">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Disconnect
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-card border-border">
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
        </div>

        {/* Cards sections here - will be added in next replacement */}
      </div>

      {/* Dialogs */}
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
        repos={syncRepos}
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
      />

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
