import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, RefreshCw, Plus, Webhook, Trash2, Home, FolderGit2,
  BarChart3, FileEdit, GitCompare, FolderSync, ChevronRight, Zap, Undo2
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ProjectLeftSidebarProps {
  isLoading?: boolean;
  projectName?: string;
  onSync: () => void;
  onAddRepos: () => void;
  onWebhooks: () => void;
  onRollback?: () => void;
  onAnalytics: () => void;
  onDelete: () => void;
  onFileEditor?: () => void;
  onFileCompare?: () => void;
  onBulkOperations?: () => void;
  isSyncing: boolean;
  isDeleting: boolean;
  showingAnalytics?: boolean;
  repoCount?: number;
  autoSyncEnabled?: boolean;
}

export function ProjectLeftSidebar({
  isLoading,
  projectName,
  onSync,
  onAddRepos,
  onWebhooks,
  onRollback,
  onAnalytics,
  onDelete,
  onFileEditor,
  onFileCompare,
  onBulkOperations,
  isSyncing,
  isDeleting,
  showingAnalytics,
  repoCount = 0,
  autoSyncEnabled,
}: ProjectLeftSidebarProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <aside className="w-[260px] shrink-0 bg-card/50 border border-border/30 rounded-2xl p-4 space-y-4">
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="space-y-2 pt-2">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
        </div>
      </aside>
    );
  }

  const NavItem = ({ icon: Icon, label, onClick, active, badge, variant = "default" }: any) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
        active
          ? "bg-primary/15 text-primary"
          : variant === "danger"
          ? "text-destructive/70 hover:text-destructive hover:bg-destructive/10"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${active ? "text-primary" : ""}`} />
      <span className="flex-1 text-left">{label}</span>
      {badge && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{badge}</Badge>}
      {!badge && !active && <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity" />}
    </button>
  );

  return (
    <aside className="w-full md:w-[260px] shrink-0 bg-card/50 md:border border-border/30 md:rounded-2xl flex flex-col overflow-hidden h-full">
      {/* Project Header */}
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
            <FolderGit2 className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-foreground truncate text-sm">{projectName || "Sync Project"}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-muted-foreground">{repoCount} repos</span>
              {autoSyncEnabled !== false && (
                <Badge className="text-[9px] px-1 py-0 h-4 bg-primary/15 text-primary border-0">
                  <Zap className="w-2.5 h-2.5 mr-0.5" /> Auto
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sync Button - Prominent */}
      <div className="px-3 pb-2">
        <Button
          onClick={onSync}
          disabled={isSyncing}
          className={`w-full h-10 rounded-xl gap-2 text-sm font-semibold ${
            isSyncing
              ? "bg-primary/20 text-primary border border-primary/30"
              : "shadow-[var(--shadow-glow)]"
          }`}
          variant={isSyncing ? "outline" : "default"}
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Syncing..." : "Sync Now"}
          {isSyncing && <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
        </Button>
      </div>

      <Separator className="bg-border/30" />

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        <NavItem icon={Home} label="Dashboard" onClick={() => navigate("/")} />

        <div className="pt-3 pb-1.5 px-3">
          <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">Manage</span>
        </div>

        <NavItem icon={Plus} label="Add Repos" onClick={onAddRepos} />
        <NavItem icon={Webhook} label="Webhooks" onClick={onWebhooks} />
        {onRollback && <NavItem icon={Undo2} label="Rollback" onClick={onRollback} />}
        <NavItem icon={BarChart3} label="Analytics" onClick={onAnalytics} active={showingAnalytics} />

        <div className="pt-3 pb-1.5 px-3">
          <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">Tools</span>
        </div>

        {onFileEditor && <NavItem icon={FileEdit} label="Edit Files" onClick={onFileEditor} />}
        {onFileCompare && <NavItem icon={GitCompare} label="Compare" onClick={onFileCompare} />}
        {onBulkOperations && <NavItem icon={FolderSync} label="Bulk Ops" onClick={onBulkOperations} />}

        <div className="pt-3 pb-1.5 px-3">
          <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">Danger</span>
        </div>

        <NavItem icon={Trash2} label="Disconnect" onClick={onDelete} variant="danger" />
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-border/20">
        <button
          onClick={() => navigate("/")}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Dashboard
        </button>
      </div>
    </aside>
  );
}
