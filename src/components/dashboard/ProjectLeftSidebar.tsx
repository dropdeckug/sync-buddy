import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  ArrowLeft, RefreshCw, Plus, Webhook, Trash2, Home, FolderGit2, BarChart3, 
  GitCompare, FolderSync, Users, Bell, Shield, History, CheckSquare, MessageSquare, Timer, Percent
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SyncProgressData {
  files_processed: number;
  total_files: number;
  current_file: string | null;
  status: string;
  target_repo_name: string;
}

interface ProjectLeftSidebarProps {
  isLoading?: boolean;
  projectName?: string;
  syncGroupId?: string;
  onSync: () => void;
  onAddRepos: () => void;
  onWebhooks: () => void;
  onAnalytics: () => void;
  onDelete: () => void;
  onFileEditor?: () => void;
  onFileCompare?: () => void;
  onBulkOperations?: () => void;
  onTeamSettings?: () => void;
  onNotifications?: () => void;
  onSecurity?: () => void;
  onAuditLog?: () => void;
  onApprovals?: () => void;
  onComments?: () => void;
  isSyncing: boolean;
  isDeleting: boolean;
  showingAnalytics?: boolean;
  activeSection?: string;
  repoCount?: number;
  maxRepos?: number;
}

export function ProjectLeftSidebar({
  isLoading,
  projectName,
  syncGroupId,
  onSync,
  onAddRepos,
  onWebhooks,
  onAnalytics,
  onDelete,
  onFileEditor,
  onFileCompare,
  onBulkOperations,
  onTeamSettings,
  onNotifications,
  onSecurity,
  onAuditLog,
  onApprovals,
  onComments,
  isSyncing,
  isDeleting,
  showingAnalytics,
  activeSection,
  repoCount = 0,
  maxRepos = 15,
}: ProjectLeftSidebarProps) {
  const navigate = useNavigate();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [syncProgress, setSyncProgress] = useState<SyncProgressData[]>([]);

  // Subscribe to sync_progress for real-time percentage updates
  useEffect(() => {
    if (!syncGroupId) return;

    // Fetch initial progress
    const fetchProgress = async () => {
      const { data } = await supabase
        .from("sync_progress")
        .select("files_processed, total_files, current_file, status, target_repo_name")
        .eq("sync_group_id", syncGroupId)
        .eq("status", "syncing");
      
      if (data) {
        setSyncProgress(data as SyncProgressData[]);
      }
    };

    fetchProgress();

    // Subscribe to changes
    const channel = supabase
      .channel("sync-progress-sidebar")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sync_progress",
          filter: `sync_group_id=eq.${syncGroupId}`,
        },
        async () => {
          // Refetch on any change
          const { data } = await supabase
            .from("sync_progress")
            .select("files_processed, total_files, current_file, status, target_repo_name")
            .eq("sync_group_id", syncGroupId)
            .eq("status", "syncing");
          
          setSyncProgress(data as SyncProgressData[] || []);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [syncGroupId]);

  // Timer for syncing state
  useEffect(() => {
    if (isSyncing || syncProgress.length > 0) {
      const interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setElapsedSeconds(0);
    }
  }, [isSyncing, syncProgress.length]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate overall progress percentage
  const getOverallProgress = (): { percentage: number; filesProcessed: number; totalFiles: number } => {
    if (syncProgress.length === 0) {
      return { percentage: 0, filesProcessed: 0, totalFiles: 0 };
    }

    const totalProcessed = syncProgress.reduce((sum, p) => sum + (p.files_processed || 0), 0);
    const totalFiles = syncProgress.reduce((sum, p) => sum + (p.total_files || 0), 0);
    const percentage = totalFiles > 0 ? Math.round((totalProcessed / totalFiles) * 100) : 0;

    return { percentage, filesProcessed: totalProcessed, totalFiles };
  };

  const progress = getOverallProgress();
  const isActivelySyncing = isSyncing || syncProgress.length > 0;

  if (isLoading) {
    return (
      <aside className="w-full lg:w-[280px] shrink-0 bg-sidebar rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-3 p-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <div className="space-y-2 pt-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-full lg:w-[280px] shrink-0 bg-sidebar rounded-xl flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
            <FolderGit2 className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sidebar-foreground truncate">
              {projectName || "Sync Project"}
            </h2>
            <p className="text-xs text-sidebar-foreground/60">Project Details</p>
          </div>
        </div>
      </div>

      {/* Navigation with independent scroll */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-sidebar-border scrollbar-track-transparent">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 h-11 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => navigate("/")}
        >
          <Home className="h-5 w-5" />
          <span>Home</span>
        </Button>

        <div className="pt-4 pb-2">
          <span className="text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider px-3">
            Sync Actions
          </span>
        </div>

        {/* Sync Button with Progress */}
        <div className="space-y-2">
          <Button
            variant={isActivelySyncing ? "secondary" : "ghost"}
            className={`w-full justify-start gap-3 h-auto min-h-11 py-2 ${isActivelySyncing ? "bg-primary/10 text-primary border border-primary/30" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}
            onClick={onSync}
            disabled={isActivelySyncing}
          >
            <RefreshCw className={`h-5 w-5 shrink-0 ${isActivelySyncing ? "animate-spin text-primary" : ""}`} />
            <div className="flex-1 text-left">
              <div className="flex items-center justify-between">
                <span>{isActivelySyncing ? "Syncing..." : "Sync Now"}</span>
                {isActivelySyncing && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30 font-mono text-xs">
                      <Percent className="h-3 w-3 mr-1" />
                      {progress.percentage}%
                    </Badge>
                    <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30 font-mono text-xs">
                      <Timer className="h-3 w-3 mr-1" />
                      {formatTime(elapsedSeconds)}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </Button>
          
          {/* Progress bar and details */}
          {isActivelySyncing && (
            <div className="px-3 space-y-2">
              <Progress value={progress.percentage} className="h-2" />
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Files processed</span>
                  <span className="font-mono">{progress.filesProcessed}/{progress.totalFiles}</span>
                </div>
                {syncProgress.length > 0 && syncProgress[0].current_file && (
                  <p className="truncate text-primary/70">
                    {syncProgress[0].current_file}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          className="w-full justify-start gap-3 h-11 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={onAddRepos}
        >
          <Plus className="h-5 w-5" />
          <span>Add Repos</span>
          {repoCount > 0 && (
            <Badge variant={repoCount >= maxRepos ? "destructive" : "secondary"} className="ml-auto text-xs">
              {repoCount}/{maxRepos}
            </Badge>
          )}
        </Button>

        <Button
          variant="ghost"
          className="w-full justify-start gap-3 h-11 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={onWebhooks}
        >
          <Webhook className="h-5 w-5" />
          <span>Webhooks</span>
        </Button>

        <div className="pt-4 pb-2">
          <span className="text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider px-3">
            Tools
          </span>
        </div>

        <Button
          variant="ghost"
          className={`w-full justify-start gap-3 h-11 ${showingAnalytics ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}
          onClick={onAnalytics}
        >
          <BarChart3 className="h-5 w-5" />
          <span>Analytics</span>
        </Button>

        {onFileCompare && (
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-11 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={onFileCompare}
          >
            <GitCompare className="h-5 w-5" />
            <span>Compare Files</span>
          </Button>
        )}

        {onBulkOperations && (
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-11 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={onBulkOperations}
          >
            <FolderSync className="h-5 w-5" />
            <span>Bulk Operations</span>
          </Button>
        )}

        {/* Team & Collaboration Section */}
        <div className="pt-4 pb-2">
          <span className="text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider px-3">
            Team & Collaboration
          </span>
        </div>

        {onTeamSettings && (
          <Button
            variant="ghost"
            className={`w-full justify-start gap-3 h-11 ${activeSection === 'team' ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}
            onClick={onTeamSettings}
          >
            <Users className="h-5 w-5" />
            <span>Team & Workspaces</span>
          </Button>
        )}

        {onApprovals && (
          <Button
            variant="ghost"
            className={`w-full justify-start gap-3 h-11 ${activeSection === 'approvals' ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}
            onClick={onApprovals}
          >
            <CheckSquare className="h-5 w-5" />
            <span>Approval Queue</span>
          </Button>
        )}

        {onComments && (
          <Button
            variant="ghost"
            className={`w-full justify-start gap-3 h-11 ${activeSection === 'comments' ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}
            onClick={onComments}
          >
            <MessageSquare className="h-5 w-5" />
            <span>Comments</span>
          </Button>
        )}

        {/* Security & Compliance Section */}
        <div className="pt-4 pb-2">
          <span className="text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider px-3">
            Security & Compliance
          </span>
        </div>

        {onSecurity && (
          <Button
            variant="ghost"
            className={`w-full justify-start gap-3 h-11 ${activeSection === 'security' ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}
            onClick={onSecurity}
          >
            <Shield className="h-5 w-5" />
            <span>Security</span>
          </Button>
        )}

        {onAuditLog && (
          <Button
            variant="ghost"
            className={`w-full justify-start gap-3 h-11 ${activeSection === 'audit' ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}
            onClick={onAuditLog}
          >
            <History className="h-5 w-5" />
            <span>Audit Log</span>
          </Button>
        )}

        {onNotifications && (
          <Button
            variant="ghost"
            className={`w-full justify-start gap-3 h-11 ${activeSection === 'notifications' ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}
            onClick={onNotifications}
          >
            <Bell className="h-5 w-5" />
            <span>Notifications</span>
          </Button>
        )}

        {/* Danger Zone */}
        <div className="pt-4 pb-2">
          <span className="text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider px-3">
            Settings
          </span>
        </div>

        <Button
          variant="ghost"
          className="w-full justify-start gap-3 h-11 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
          disabled={isDeleting}
        >
          <Trash2 className="h-5 w-5" />
          <span>Disconnect Project</span>
        </Button>
      </nav>

      {/* Back button footer */}
      <div className="p-3 border-t border-sidebar-border shrink-0">
        <Button
          variant="outline"
          className="w-full justify-start gap-3 border-sidebar-border text-sidebar-foreground"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Dashboard</span>
        </Button>
      </div>
    </aside>
  );
}
