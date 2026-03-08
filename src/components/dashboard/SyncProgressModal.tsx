import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2, XCircle, Loader2, GitBranch, ArrowRight,
  Clock, ArrowDown, FileText, Zap, AlertCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SyncRepo {
  name: string;
  full_name: string;
  status: 'pending' | 'syncing' | 'completed' | 'failed' | 'timeout';
  currentFile?: string;
  filesProcessed?: number;
  totalFiles?: number;
  filesAdded?: number;
  filesChanged?: number;
  filesDeleted?: number;
  error?: string;
  sourceRepoName?: string;
  sourceRepoFullName?: string;
  startedAt?: number;
}

interface SyncProgressModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syncGroupId: string;
  accountId: string;
  initialRepos: SyncRepo[];
}

const SYNC_TIMEOUT_MS = 5 * 60 * 1000;

export const SyncProgressModal = ({ open, onOpenChange, syncGroupId, accountId, initialRepos }: SyncProgressModalProps) => {
  const [repos, setRepos] = useState<SyncRepo[]>(initialRepos.map(r => ({ ...r, startedAt: Date.now() })));
  const [sourceRepo, setSourceRepo] = useState<string>('');
  const timeoutCheckRef = useRef<NodeJS.Timeout | null>(null);

  const completedCount = repos.filter(r => r.status === 'completed' || r.status === 'failed' || r.status === 'timeout').length;
  const allCompleted = completedCount === repos.length;
  const successCount = repos.filter(r => r.status === 'completed').length;
  const failCount = repos.filter(r => r.status === 'failed' || r.status === 'timeout').length;
  const overallPct = repos.length > 0 ? Math.round((completedCount / repos.length) * 100) : 0;

  useEffect(() => {
    if (!open) return;
    const checkTimeouts = () => {
      setRepos(prev => prev.map(r => {
        if (r.status === 'syncing' && r.startedAt && Date.now() - r.startedAt > SYNC_TIMEOUT_MS) {
          return { ...r, status: 'timeout' as const, error: 'Sync timed out - may still be running in background' };
        }
        return r;
      }));
    };
    timeoutCheckRef.current = setInterval(checkTimeouts, 10000);
    return () => { if (timeoutCheckRef.current) clearInterval(timeoutCheckRef.current); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel('sync-progress-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sync_progress', filter: `account_id=eq.${accountId}` }, (payload) => {
        const record = payload.new as any;
        if (record.source_repo_full_name && !sourceRepo) setSourceRepo(record.source_repo_full_name);
        setRepos(prev => {
          const updated = [...prev];
          const idx = updated.findIndex(r => r.full_name === record.target_repo_full_name);
          if (idx !== -1) {
            updated[idx] = {
              ...updated[idx],
              status: record.status,
              currentFile: record.current_file,
              filesProcessed: record.files_processed || 0,
              totalFiles: record.total_files || 0,
              error: record.error_message,
              sourceRepoName: record.source_repo_name,
              sourceRepoFullName: record.source_repo_full_name,
            };
          }
          return updated;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [accountId, open, sourceRepo]);

  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel('sync-history-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sync_history', filter: `account_id=eq.${accountId}` }, (payload) => {
        const rec = payload.new as any;
        setRepos(prev => {
          const updated = [...prev];
          const idx = updated.findIndex(r => r.full_name === rec.repo_full_name);
          if (idx !== -1) {
            updated[idx] = {
              ...updated[idx],
              status: rec.status === 'success' ? 'completed' : 'failed',
              filesAdded: rec.files_added || 0,
              filesChanged: rec.files_changed || 0,
              filesDeleted: rec.files_deleted || 0,
              error: rec.error_message,
            };
          }
          return updated;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [accountId, open]);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'completed': return { icon: CheckCircle2, color: 'text-primary', bg: 'bg-primary/10 border-primary/20', label: 'Synced' };
      case 'failed': return { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10 border-destructive/20', label: 'Failed' };
      case 'timeout': return { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/20', label: 'Timeout' };
      case 'syncing': return { icon: Loader2, color: 'text-primary', bg: 'bg-primary/5 border-primary/15', label: 'Syncing' };
      default: return { icon: GitBranch, color: 'text-muted-foreground', bg: 'bg-muted/20 border-border/30', label: 'Pending' };
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 rounded-2xl border-border/40 bg-card/95 backdrop-blur-xl">
        {/* Header */}
        <DialogHeader className="px-6 py-5 border-b border-border/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${
              allCompleted
                ? failCount > 0 ? "bg-amber-500/10 border-amber-500/20" : "bg-primary/10 border-primary/20"
                : "bg-primary/10 border-primary/20"
            }`}>
              {allCompleted ? (
                failCount > 0 ? <AlertCircle className="h-5 w-5 text-amber-500" /> : <CheckCircle2 className="h-5 w-5 text-primary" />
              ) : (
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
              )}
            </div>
            <div className="flex-1">
              <DialogTitle className="text-base font-bold">
                {allCompleted ? "Sync Complete" : "Syncing Repositories"}
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {sourceRepo ? (
                  <span className="flex items-center gap-1.5">
                    Source: <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-mono">{sourceRepo}</Badge>
                  </span>
                ) : (
                  "Syncing changes across repositories..."
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Overall Progress */}
        <div className="px-6 py-4 border-b border-border/20 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Overall Progress</span>
            <span className="text-xs text-muted-foreground">{completedCount}/{repos.length} repos</span>
          </div>
          <Progress value={overallPct} className="h-2" />
          <div className="flex gap-3">
            {successCount > 0 && (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-primary" />
                <span className="text-[10px] text-muted-foreground">{successCount} synced</span>
              </div>
            )}
            {failCount > 0 && (
              <div className="flex items-center gap-1.5">
                <XCircle className="w-3 h-3 text-destructive" />
                <span className="text-[10px] text-muted-foreground">{failCount} failed</span>
              </div>
            )}
            {repos.length - completedCount > 0 && (
              <div className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />
                <span className="text-[10px] text-muted-foreground">{repos.length - completedCount} remaining</span>
              </div>
            )}
          </div>
        </div>

        {/* Repository List */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-3 space-y-2">
            {repos.map((repo) => {
              const config = getStatusConfig(repo.status);
              const StatusIcon = config.icon;
              const filePct = repo.totalFiles && repo.totalFiles > 0
                ? Math.round(((repo.filesProcessed || 0) / repo.totalFiles) * 100)
                : 0;

              return (
                <div
                  key={repo.full_name}
                  className={`p-3.5 rounded-xl border transition-all ${config.bg}`}
                >
                  {/* Repo Header */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <StatusIcon className={`h-4 w-4 shrink-0 ${config.color} ${repo.status === 'syncing' ? 'animate-spin' : ''}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{repo.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{repo.full_name}</p>
                      </div>
                    </div>
                    <Badge
                      variant={repo.status === 'completed' ? 'default' : repo.status === 'failed' ? 'destructive' : 'secondary'}
                      className="text-[10px] px-2 py-0 h-5 rounded-md shrink-0"
                    >
                      {config.label}
                    </Badge>
                  </div>

                  {/* Syncing Progress */}
                  {repo.status === 'syncing' && (
                    <div className="mt-3 space-y-2">
                      {repo.currentFile && (
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                          <p className="text-[10px] text-muted-foreground truncate">{repo.currentFile}</p>
                        </div>
                      )}
                      {repo.totalFiles && repo.totalFiles > 0 && (
                        <>
                          <Progress value={filePct} className="h-1" />
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">{repo.filesProcessed}/{repo.totalFiles} files</span>
                            <span className="text-[10px] text-muted-foreground">{filePct}%</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Completed Stats */}
                  {repo.status === 'completed' && (repo.filesAdded || repo.filesChanged || repo.filesDeleted) && (
                    <div className="flex gap-3 mt-2">
                      {(repo.filesAdded ?? 0) > 0 && (
                        <span className="text-[10px] text-primary font-medium">+{repo.filesAdded} added</span>
                      )}
                      {(repo.filesChanged ?? 0) > 0 && (
                        <span className="text-[10px] text-muted-foreground font-medium">~{repo.filesChanged} changed</span>
                      )}
                      {(repo.filesDeleted ?? 0) > 0 && (
                        <span className="text-[10px] text-destructive font-medium">-{repo.filesDeleted} deleted</span>
                      )}
                    </div>
                  )}

                  {/* Error */}
                  {(repo.status === 'failed' || repo.status === 'timeout') && repo.error && (
                    <p className="text-[10px] text-destructive mt-2 bg-destructive/5 rounded-lg px-2.5 py-1.5">{repo.error}</p>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/30 flex items-center justify-between shrink-0">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
            {allCompleted ? (
              <><CheckCircle2 className="w-3 h-3 text-primary" /> All operations complete</>
            ) : (
              <><Zap className="w-3 h-3" /> Sync continues in background if closed</>
            )}
          </p>
          <Button onClick={() => onOpenChange(false)} className="rounded-xl h-9 px-6 text-sm">
            {allCompleted ? "Done" : "Close"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
