import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, GitBranch } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface FileProgress {
  path: string;
  status: 'pending' | 'fetching' | 'creating' | 'done';
}

interface SyncRepo {
  name: string;
  full_name: string;
  status: 'pending' | 'syncing' | 'success' | 'failed';
  filesAdded?: number;
  filesChanged?: number;
  filesDeleted?: number;
  error?: string;
  currentFile?: string;
  processedFiles?: number;
  totalFiles?: number;
  fileProgress?: FileProgress[];
}

interface SyncProgressModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syncGroupId: string;
  accountId: string;
  repos: SyncRepo[];
}

export const SyncProgressModal = ({ 
  open, 
  onOpenChange, 
  syncGroupId, 
  accountId,
  repos: initialRepos 
}: SyncProgressModalProps) => {
  const [repos, setRepos] = useState<SyncRepo[]>(initialRepos);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSyncing, setIsSyncing] = useState(true);

  const totalRepos = repos.length;
  const completedRepos = repos.filter(r => r.status === 'success' || r.status === 'failed').length;
  const progress = totalRepos > 0 ? (completedRepos / totalRepos) * 100 : 0;
  const allCompleted = completedRepos === totalRepos;

  // Check if all syncing is complete
  useEffect(() => {
    if (allCompleted && isSyncing) {
      setIsSyncing(false);
    }
  }, [allCompleted, isSyncing]);

  // Listen to sync history changes
  useEffect(() => {
    if (!open || !accountId) return;

    const channel = supabase
      .channel(`sync-progress-${syncGroupId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sync_history",
          filter: `account_id=eq.${accountId}`,
        },
        (payload) => {
          const record = payload.new as any;
          
          setRepos(prev => prev.map(repo => {
            if (repo.full_name === record.repo_full_name) {
              return {
                ...repo,
                status: record.status === 'success' ? 'success' : 'failed',
                filesAdded: record.files_added || 0,
                filesChanged: record.files_changed || 0,
                filesDeleted: record.files_deleted || 0,
                error: record.error_message,
                processedFiles: record.files_added + record.files_changed + record.files_deleted,
                totalFiles: record.files_added + record.files_changed + record.files_deleted,
              };
            }
            return repo;
          }));

          // Move to next repo
          setCurrentIndex(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, accountId, syncGroupId]);

  // Mark current repo as syncing
  useEffect(() => {
    if (currentIndex < repos.length && repos[currentIndex].status === 'pending') {
      setRepos(prev => prev.map((repo, idx) => 
        idx === currentIndex ? { ...repo, status: 'syncing' } : repo
      ));
    }
  }, [currentIndex, repos]);

  const getStatusIcon = (status: SyncRepo['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'syncing':
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-muted" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      // Only allow closing if syncing is complete
      if (!newOpen && isSyncing) {
        return; // Prevent closing while syncing
      }
      onOpenChange(newOpen);
    }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Syncing Repositories
            </div>
            {isSyncing && (
              <Badge variant="secondary" className="animate-pulse">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Syncing in progress...
              </Badge>
            )}
            {!isSyncing && allCompleted && (
              <Badge variant="default" className="bg-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Complete
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 flex-1 overflow-hidden flex flex-col">
          {/* Overall Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="font-medium">{completedRepos} of {totalRepos} repositories</span>
            </div>
            <Progress value={progress} className="h-3" />
            <p className="text-xs text-muted-foreground text-right">
              {Math.round(progress)}% complete
            </p>
          </div>

          {/* Repository List */}
          <div className="space-y-3 overflow-y-auto flex-1 pr-2">
            {repos.map((repo, index) => (
              <div
                key={repo.full_name}
                className={`p-4 border rounded-lg transition-all ${
                  repo.status === 'syncing' 
                    ? 'border-primary bg-primary/5 shadow-md' 
                    : repo.status === 'success'
                    ? 'border-green-500/30 bg-green-50/5'
                    : repo.status === 'failed'
                    ? 'border-destructive/30 bg-destructive/5'
                    : 'border-border'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      {getStatusIcon(repo.status)}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{repo.name}</p>
                        <p className="text-sm text-muted-foreground truncate">{repo.full_name}</p>
                      </div>
                    </div>
                    
                    <Badge variant={
                      repo.status === 'success' ? 'default' : 
                      repo.status === 'failed' ? 'destructive' : 
                      repo.status === 'syncing' ? 'secondary' : 
                      'outline'
                    }>
                      {repo.status}
                    </Badge>
                  </div>

                  {/* Syncing Progress Details */}
                  {repo.status === 'syncing' && (
                    <div className="space-y-2 pl-8">
                      {repo.currentFile && (
                        <div className="text-xs">
                          <p className="text-muted-foreground mb-1">Processing:</p>
                          <p className="font-mono text-primary truncate">{repo.currentFile}</p>
                        </div>
                      )}
                      {repo.processedFiles !== undefined && repo.totalFiles !== undefined && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Files processed</span>
                            <span>{repo.processedFiles} / {repo.totalFiles}</span>
                          </div>
                          <Progress 
                            value={repo.totalFiles > 0 ? (repo.processedFiles / repo.totalFiles) * 100 : 0} 
                            className="h-1.5"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Success Summary */}
                  {repo.status === 'success' && (
                    <div className="flex gap-4 pl-8 text-xs">
                      <div className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-green-600" />
                        <span className="text-muted-foreground">+{repo.filesAdded} added</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-blue-600" />
                        <span className="text-muted-foreground">~{repo.filesChanged} changed</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-red-600" />
                        <span className="text-muted-foreground">-{repo.filesDeleted} deleted</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Error Message */}
                  {repo.status === 'failed' && repo.error && (
                    <div className="pl-8 p-2 bg-destructive/10 rounded text-xs text-destructive">
                      {repo.error}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Close Button - Only enabled when syncing is complete */}
          {!isSyncing && allCompleted && (
            <div className="pt-4 border-t">
              <Button 
                onClick={() => onOpenChange(false)}
                className="w-full"
              >
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
