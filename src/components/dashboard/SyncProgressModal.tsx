import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, GitBranch, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SyncRepo {
  name: string;
  full_name: string;
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  currentFile?: string;
  filesProcessed?: number;
  totalFiles?: number;
  filesAdded?: number;
  filesChanged?: number;
  filesDeleted?: number;
  error?: string;
  sourceRepoName?: string;
  sourceRepoFullName?: string;
}

interface SyncProgressModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syncGroupId: string;
  accountId: string;
  initialRepos: SyncRepo[];
}

export const SyncProgressModal = ({ open, onOpenChange, syncGroupId, accountId, initialRepos }: SyncProgressModalProps) => {
  const [repos, setRepos] = useState<SyncRepo[]>(initialRepos);
  const [isSyncing, setIsSyncing] = useState(true);
  const [sourceRepo, setSourceRepo] = useState<string>('');

  const allCompleted = repos.every(r => r.status === 'completed' || r.status === 'failed');

  // Auto-close when all repos are done syncing
  useEffect(() => {
    if (allCompleted && !isSyncing) {
      const timer = setTimeout(() => {
        setIsSyncing(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [allCompleted, isSyncing]);

  // Listen to sync_progress updates for real-time file-by-file progress
  useEffect(() => {
    if (!open) return;

    const channel = supabase
      .channel('sync-progress-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sync_progress',
          filter: `account_id=eq.${accountId}`,
        },
        (payload) => {
          const record = payload.new as any;
          
          // Set source repo from first record
          if (record.source_repo_full_name && !sourceRepo) {
            setSourceRepo(record.source_repo_full_name);
          }
          
          setRepos(prevRepos => {
            const updatedRepos = [...prevRepos];
            const repoIndex = updatedRepos.findIndex(r => r.full_name === record.target_repo_full_name);
            
            if (repoIndex !== -1) {
              updatedRepos[repoIndex] = {
                ...updatedRepos[repoIndex],
                status: record.status,
                currentFile: record.current_file,
                filesProcessed: record.files_processed || 0,
                totalFiles: record.total_files || 0,
                error: record.error_message,
                sourceRepoName: record.source_repo_name,
                sourceRepoFullName: record.source_repo_full_name,
              };
            }
            
            return updatedRepos;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountId, open, sourceRepo]);

  // Listen to sync_history for final results
  useEffect(() => {
    if (!open) return;

    const historyChannel = supabase
      .channel('sync-history-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sync_history',
          filter: `account_id=eq.${accountId}`,
        },
        (payload) => {
          const newRecord = payload.new as any;
          
          setRepos(prevRepos => {
            const updatedRepos = [...prevRepos];
            const repoIndex = updatedRepos.findIndex(r => r.full_name === newRecord.repo_full_name);
            
            if (repoIndex !== -1) {
              updatedRepos[repoIndex] = {
                ...updatedRepos[repoIndex],
                status: newRecord.status === 'success' ? 'completed' : 'failed',
                filesAdded: newRecord.files_added || 0,
                filesChanged: newRecord.files_changed || 0,
                filesDeleted: newRecord.files_deleted || 0,
                error: newRecord.error_message,
              };
            }
            
            return updatedRepos;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(historyChannel);
    };
  }, [accountId, open]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'syncing':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <GitBranch className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Sync Progress</DialogTitle>
          <DialogDescription>
            {sourceRepo && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-sm">Syncing from:</span>
                <Badge variant="secondary" className="font-mono text-xs">
                  {sourceRepo}
                </Badge>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1">
          {/* Overall Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Overall Progress</span>
              <span className="text-muted-foreground">
                {repos.filter(r => r.status === 'completed' || r.status === 'failed').length} / {repos.length}
              </span>
            </div>
            <Progress 
              value={(repos.filter(r => r.status === 'completed' || r.status === 'failed').length / repos.length) * 100} 
              className="h-2"
            />
          </div>

          {/* Individual Repository Progress */}
          <div className="space-y-3">
            {repos.map((repo) => (
              <div 
                key={repo.full_name} 
                className="border rounded-lg p-4 space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {repo.sourceRepoFullName && (
                        <>
                          <span className="text-xs text-muted-foreground font-mono">{repo.sourceRepoFullName}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        </>
                      )}
                      {getStatusIcon(repo.status)}
                      <span className="font-medium truncate">{repo.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{repo.full_name}</p>
                  </div>
                  <Badge 
                    variant={
                      repo.status === 'completed' ? 'default' :
                      repo.status === 'failed' ? 'destructive' :
                      repo.status === 'syncing' ? 'secondary' :
                      'outline'
                    }
                  >
                    {repo.status}
                  </Badge>
                </div>

                {repo.status === 'syncing' && (
                  <div className="space-y-1">
                    {repo.currentFile && (
                      <p className="text-xs text-muted-foreground truncate">
                        Processing: {repo.currentFile}
                      </p>
                    )}
                    {repo.totalFiles && repo.totalFiles > 0 && (
                      <>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Files: {repo.filesProcessed} / {repo.totalFiles}</span>
                          <span>{Math.round(((repo.filesProcessed || 0) / repo.totalFiles) * 100)}%</span>
                        </div>
                        <Progress 
                          value={((repo.filesProcessed || 0) / repo.totalFiles) * 100} 
                          className="h-1"
                        />
                      </>
                    )}
                  </div>
                )}

                {repo.status === 'completed' && (
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    {(repo.filesAdded ?? 0) > 0 && (
                      <span className="text-green-600">+{repo.filesAdded} added</span>
                    )}
                    {(repo.filesChanged ?? 0) > 0 && (
                      <span className="text-blue-600">~{repo.filesChanged} changed</span>
                    )}
                    {(repo.filesDeleted ?? 0) > 0 && (
                      <span className="text-red-600">-{repo.filesDeleted} deleted</span>
                    )}
                  </div>
                )}

                {repo.status === 'failed' && repo.error && (
                  <p className="text-xs text-red-500">{repo.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button 
            onClick={() => onOpenChange(false)}
            disabled={isSyncing}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};