import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, GitBranch } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SyncRepo {
  name: string;
  full_name: string;
  status: 'pending' | 'syncing' | 'success' | 'failed';
  filesAdded?: number;
  filesChanged?: number;
  filesDeleted?: number;
  error?: string;
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

  const totalRepos = repos.length;
  const completedRepos = repos.filter(r => r.status === 'success' || r.status === 'failed').length;
  const progress = totalRepos > 0 ? (completedRepos / totalRepos) * 100 : 0;

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Syncing Repositories
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Overall Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="font-medium">{completedRepos} of {totalRepos} completed</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Repository List */}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {repos.map((repo, index) => (
              <div
                key={repo.full_name}
                className={`p-4 border rounded-lg transition-all ${
                  repo.status === 'syncing' ? 'border-primary bg-primary/5' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    {getStatusIcon(repo.status)}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{repo.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{repo.full_name}</p>
                      
                      {repo.status === 'success' && (
                        <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="text-green-600">+{repo.filesAdded} added</span>
                          <span className="text-blue-600">~{repo.filesChanged} changed</span>
                          <span className="text-red-600">-{repo.filesDeleted} deleted</span>
                        </div>
                      )}
                      
                      {repo.status === 'failed' && repo.error && (
                        <p className="text-sm text-destructive mt-2">{repo.error}</p>
                      )}
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
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
