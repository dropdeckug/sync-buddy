import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/alert-dialog";
import { Webhook, FileEdit, GitBranch as GitBranchIcon, Menu, Activity } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

import { ProjectLeftSidebar } from "@/components/dashboard/ProjectLeftSidebar";
import { ProjectMainContent } from "@/components/dashboard/ProjectMainContent";
import { ProjectRightSidebar } from "@/components/dashboard/ProjectRightSidebar";
import { AddReposToGroup } from "@/components/dashboard/AddReposToGroup";
import { SyncProgressModal } from "@/components/dashboard/SyncProgressModal";
import { WebhookManager } from "@/components/dashboard/WebhookManager";
import RepositoryBrowser from "@/components/dashboard/RepositoryBrowser";
import { ProjectAnalyticsPage } from "@/components/analytics";
import { FileComparison, BulkOperations } from "@/components/editor";
import { FullScreenEditor } from "@/components/editor/FullScreenEditor";

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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isAnySyncInProgress, setIsAnySyncInProgress] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showFileComparison, setShowFileComparison] = useState(false);
  const [showBulkOperations, setShowBulkOperations] = useState(false);
  const [showFileEditor, setShowFileEditor] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [showMobileActivity, setShowMobileActivity] = useState(false);
  const isMobile = useIsMobile();

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

  // Fetch account access token
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

  // Fetch commits
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

  const queryClient = useQueryClient();

  // Check for active syncs on mount and setup realtime subscription
  useEffect(() => {
    if (!id || !syncGroup?.account_id) return;

    // Check for existing syncing records on mount
    const checkActiveSyncs = async () => {
      const { data } = await supabase
        .from('sync_progress')
        .select('id')
        .eq('sync_group_id', id)
        .eq('status', 'syncing')
        .limit(1);
      
      setIsAnySyncInProgress(data && data.length > 0);
    };
    
    checkActiveSyncs();

    // Subscribe to sync_progress changes to track active syncs
    const progressChannel = supabase
      .channel("sync-progress-tracking")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sync_progress",
          filter: `sync_group_id=eq.${id}`,
        },
        async (payload) => {
          // Re-check if any syncing records exist
          const { data } = await supabase
            .from('sync_progress')
            .select('id')
            .eq('sync_group_id', id)
            .eq('status', 'syncing')
            .limit(1);
          
          setIsAnySyncInProgress(data && data.length > 0);
        }
      )
      .subscribe();

    // Subscribe to sync_history for toast notifications AND query invalidation
    const historyChannel = supabase
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
          const record = payload.new as any;
          
          // Invalidate queries to refresh UI
          queryClient.invalidateQueries({ queryKey: ["sync-history-sidebar", syncGroup.account_id] });
          queryClient.invalidateQueries({ queryKey: ["sync-history-recent", syncGroup.account_id] });
          queryClient.invalidateQueries({ queryKey: ["sync-group", id] });
          queryClient.invalidateQueries({ queryKey: ["repo-commits", id] });
          
          if (payload.eventType === 'INSERT' && record) {
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

    // Subscribe to repos table changes to update mother repo info
    const reposChannel = supabase
      .channel("repos-changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "repos",
        },
        () => {
          // Refetch sync group to get updated mother repo info
          queryClient.invalidateQueries({ queryKey: ["sync-group", id] });
          queryClient.invalidateQueries({ queryKey: ["sync-group-repos", id] });
          queryClient.invalidateQueries({ queryKey: ["repo-commits", id] });
        }
      )
      .subscribe();

    // Subscribe to sync_groups table for updates to mother repo
    const syncGroupsChannel = supabase
      .channel("sync-groups-changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sync_groups",
          filter: `id=eq.${id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["sync-group", id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(progressChannel);
      supabase.removeChannel(historyChannel);
      supabase.removeChannel(reposChannel);
      supabase.removeChannel(syncGroupsChannel);
    };
  }, [id, syncGroup?.account_id, toast, queryClient]);

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
      supabase.functions.invoke("sync-repos", {
        body: {
          syncGroupId: id,
          accountId: syncGroup.account_id,
        },
      }).then(({ data, error }) => {
        if (error) {
          console.error('Sync error:', error);
        } else if (data?.message === 'No new commits to sync') {
          toast({
            title: "Already Up to Date",
            description: "All repositories are already synced with the latest commits.",
          });
          setShowSyncModal(false);
        }
        refetchGroup();
        refetchRepos();
        refetchCommits();
      });

      toast({
        title: "Sync Started",
        description: "Syncing in background. Progress updates will appear in the modal.",
      });
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

  const handleToggleAutoSync = async (enabled: boolean) => {
    try {
      const { error } = await supabase
        .from("sync_groups")
        .update({ auto_sync_enabled: enabled })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: enabled ? "Auto-sync Enabled" : "Auto-sync Disabled",
        description: enabled 
          ? "Repositories will sync automatically when changes are pushed." 
          : "Manual sync required. Webhooks will not trigger sync.",
      });

      refetchGroup();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
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
      setShowDeleteDialog(false);
    }
  };

  const isLoading = loadingGroup || loadingRepos;

  // Prepare repos list for comparison and bulk operations
  const allReposForTools = syncGroup ? [
    { id: syncGroup.mother_repo?.id, name: syncGroup.mother_repo?.name, fullName: syncGroup.mother_repo?.full_name },
    ...(childRepos?.map(cr => ({ id: cr.repo?.id, name: cr.repo?.name, fullName: cr.repo?.full_name })) || [])
  ].filter(r => r.id && r.name && r.fullName) : [];

  if (showFileEditor && syncGroup) {
    const editorRepos = [
      { id: syncGroup.mother_repo?.id, name: syncGroup.mother_repo?.name, full_name: syncGroup.mother_repo?.full_name, isMother: true },
      ...(childRepos?.map(cr => ({ id: cr.repo?.id, name: cr.repo?.name, full_name: cr.repo?.full_name, isMother: false })) || [])
    ].filter(r => r.id && r.name && r.full_name);

    return (
      <FullScreenEditor
        accountId={syncGroup.account_id}
        syncGroupId={id!}
        repos={editorRepos}
        onClose={() => setShowFileEditor(false)}
      />
    );
  }

  const sidebarContent = (
    <ProjectLeftSidebar
      isLoading={isLoading}
      projectName={syncGroup?.name}
      onSync={handleSync}
      onAddRepos={() => { setShowAddRepos(true); setShowMobileNav(false); }}
      onWebhooks={() => { setShowWebhookManager(true); setShowMobileNav(false); }}
      onAnalytics={() => { setShowAnalytics(!showAnalytics); setShowMobileNav(false); }}
      onDelete={() => { setShowDeleteDialog(true); setShowMobileNav(false); }}
      onFileEditor={() => { setShowFileEditor(true); setShowMobileNav(false); }}
      onFileCompare={() => { setShowFileComparison(true); setShowMobileNav(false); }}
      onBulkOperations={() => { setShowBulkOperations(true); setShowMobileNav(false); }}
      isSyncing={isSyncing || isAnySyncInProgress}
      isDeleting={isDeleting}
      showingAnalytics={showAnalytics}
      repoCount={(childRepos?.length || 0) + 1}
      autoSyncEnabled={syncGroup?.auto_sync_enabled}
    />
  );

  return (
    <div className="h-screen flex flex-col md:flex-row w-full bg-background md:gap-2 md:p-2 overflow-hidden">
      {/* Mobile Top Bar */}
      {isMobile && (
        <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-border/30 bg-card/50 backdrop-blur-sm">
          <Sheet open={showMobileNav} onOpenChange={setShowMobileNav}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-lg w-9 h-9">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-[280px]">
              {sidebarContent}
            </SheetContent>
          </Sheet>
          <h1 className="text-sm font-bold truncate flex-1 text-center">{syncGroup?.name || "Project"}</h1>
          <Sheet open={showMobileActivity} onOpenChange={setShowMobileActivity}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-lg w-9 h-9">
                <Activity className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-0 w-[320px]">
              <ProjectRightSidebar
                accountId={syncGroup?.account_id || null}
                isLoading={isLoading}
              />
            </SheetContent>
          </Sheet>
        </div>
      )}

      {/* Left Sidebar - Desktop only */}
      {!isMobile && sidebarContent}

      {/* Main Content - Center */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {showAnalytics ? (
          <ProjectAnalyticsPage
            syncGroupId={id!}
            accountId={syncGroup?.account_id || ""}
            childRepos={childRepos || []}
            onViewRepo={setViewingRepo}
            onBack={() => setShowAnalytics(false)}
          />
        ) : (
          <ProjectMainContent
            isLoading={isLoading}
            syncGroup={syncGroup}
            childRepos={childRepos}
            commits={commits}
            loadingCommits={loadingCommits}
            accessToken={accountData?.access_token}
            autoSyncEnabled={syncGroup?.auto_sync_enabled}
            onToggleAutoSync={handleToggleAutoSync}
            onViewRepo={setViewingRepo}
            onChangeMother={() => {
              setSelectedMotherRepoId(syncGroup?.mother_repo_id || "");
              setShowChangeMotherRepo(true);
            }}
          />
        )}
      </div>

      {/* Right Sidebar - Desktop only */}
      {!isMobile && !showAnalytics && (
        <ProjectRightSidebar
          accountId={syncGroup?.account_id || null}
          isLoading={isLoading}
        />
      )}

      {/* Dialogs */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
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
            <AlertDialogAction 
              onClick={handleDeleteProject} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showChangeMotherRepo} onOpenChange={setShowChangeMotherRepo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Mother Repository</DialogTitle>
            <DialogDescription>
              Select a new mother repository for this sync project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="mother-repo-select">Mother Repository</Label>
              <Select value={selectedMotherRepoId} onValueChange={setSelectedMotherRepoId}>
                <SelectTrigger id="mother-repo-select">
                  <SelectValue placeholder="Select a repository" />
                </SelectTrigger>
                <SelectContent>
                  {syncGroup && (
                    <SelectItem value={syncGroup.mother_repo.id}>
                      {syncGroup.mother_repo.full_name} (Current)
                    </SelectItem>
                  )}
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
        accountId={syncGroup?.account_id || ""}
        initialRepos={syncRepos}
      />

      {syncGroup && (
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
      )}

      <Dialog open={showWebhookManager} onOpenChange={setShowWebhookManager}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Webhook Management
            </DialogTitle>
            <DialogDescription>
              Manage GitHub webhooks for automatic syncing.
            </DialogDescription>
          </DialogHeader>
          {accountData?.access_token && syncGroup && (
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
          {viewingRepo && syncGroup && (
            <RepositoryBrowser
              accountId={syncGroup.account_id}
              repoId={viewingRepo.id}
              repoName={viewingRepo.name}
              repoFullName={viewingRepo.full_name}
              syncGroupId={id}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* File Comparison Tool */}
      {syncGroup && (
        <FileComparison
          isOpen={showFileComparison}
          onClose={() => setShowFileComparison(false)}
          accountId={syncGroup.account_id}
          repos={allReposForTools}
        />
      )}

      {/* Bulk Operations Tool */}
      {syncGroup && (
        <BulkOperations
          isOpen={showBulkOperations}
          onClose={() => setShowBulkOperations(false)}
          accountId={syncGroup.account_id}
          repos={allReposForTools}
        />
      )}

    </div>
  );
};

export default SyncProject;
