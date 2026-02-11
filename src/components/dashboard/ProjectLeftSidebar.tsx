import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, RefreshCw, Plus, Webhook, Trash2, Home, FolderGit2, BarChart3, FileEdit, GitCompare, FolderSync } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ProjectLeftSidebarProps {
  isLoading?: boolean;
  projectName?: string;
  onSync: () => void;
  onAddRepos: () => void;
  onWebhooks: () => void;
  onAnalytics: () => void;
  onDelete: () => void;
  onFileEditor?: () => void;
  onFileCompare?: () => void;
  onBulkOperations?: () => void;
  isSyncing: boolean;
  isDeleting: boolean;
  showingAnalytics?: boolean;
}

export function ProjectLeftSidebar({
  isLoading,
  projectName,
  onSync,
  onAddRepos,
  onWebhooks,
  onAnalytics,
  onDelete,
  onFileEditor,
  onFileCompare,
  onBulkOperations,
  isSyncing,
  isDeleting,
  showingAnalytics,
}: ProjectLeftSidebarProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <aside className="w-[280px] shrink-0 bg-sidebar rounded-xl p-4 space-y-4">
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
    <aside className="w-[280px] shrink-0 bg-sidebar rounded-xl flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
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

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
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

        <Button
          variant="ghost"
          className={`w-full justify-start gap-3 h-11 ${isSyncing ? "text-primary bg-primary/10" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}
          onClick={onSync}
          disabled={isSyncing}
        >
          <RefreshCw className={`h-5 w-5 ${isSyncing ? "animate-spin text-primary" : ""}`} />
          <span className="flex-1 text-left">{isSyncing ? "Syncing..." : "Sync Now"}</span>
          {isSyncing && (
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          )}
        </Button>

        <Button
          variant="ghost"
          className="w-full justify-start gap-3 h-11 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={onAddRepos}
        >
          <Plus className="h-5 w-5" />
          <span>Add Repos</span>
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

        {onFileEditor && (
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-11 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={onFileEditor}
          >
            <FileEdit className="h-5 w-5" />
            <span>Edit Files</span>
          </Button>
        )}

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
      <div className="p-3 border-t border-sidebar-border">
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
