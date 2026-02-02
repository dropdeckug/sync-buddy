import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, RefreshCw, Plus, Webhook, Trash2, Home, FolderGit2, BarChart3, 
  GitCompare, FolderSync, Users, Bell, Shield, History, CheckSquare, MessageSquare
} from "lucide-react";
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
