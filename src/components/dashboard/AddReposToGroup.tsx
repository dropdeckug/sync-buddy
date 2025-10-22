import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { SyncProgressModal } from "./SyncProgressModal";

interface AddReposToGroupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syncGroupId: string;
  accountId: string;
  motherRepoId: string;
  existingRepoIds: string[];
  availableRepos: any[];
}

export const AddReposToGroup = ({
  open,
  onOpenChange,
  syncGroupId,
  accountId,
  motherRepoId,
  existingRepoIds,
  availableRepos,
}: AddReposToGroupProps) => {
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [showSyncProgress, setShowSyncProgress] = useState(false);
  const [reposToSync, setReposToSync] = useState<any[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const toggleRepo = (repoId: string) => {
    setSelectedRepos(prev =>
      prev.includes(repoId)
        ? prev.filter(id => id !== repoId)
        : [...prev, repoId]
    );
  };

  const handleAddRepos = async () => {
    if (selectedRepos.length === 0) {
      toast({
        title: "No repositories selected",
        description: "Please select at least one repository to add",
        variant: "destructive",
      });
      return;
    }

    setIsAdding(true);
    try {
      // Upsert selected repos to ensure they exist in database
      const reposToInsert = availableRepos
        .filter(repo => selectedRepos.includes(repo.id.toString()))
        .map(repo => ({
          account_id: accountId,
          name: repo.name,
          full_name: repo.full_name,
          owner: repo.owner?.login || repo.full_name?.split('/')[0] || '',
          github_id: repo.id.toString(),
          default_branch: repo.default_branch || 'main',
          is_private: repo.private || false,
        }));

      const { error: upsertError } = await supabase
        .from("repos")
        .upsert(reposToInsert, { onConflict: 'github_id' });

      if (upsertError) throw upsertError;

      // Fetch the UUID ids
      const { data: dbRepos, error: fetchError } = await supabase
        .from("repos")
        .select("id, github_id, name, full_name")
        .in("github_id", selectedRepos);

      if (fetchError) throw fetchError;
      if (!dbRepos || dbRepos.length === 0) throw new Error("Failed to fetch repository IDs");

      // Add repos to sync group
      const repoInserts = dbRepos.map(repo => ({
        sync_group_id: syncGroupId,
        repo_id: repo.id,
      }));

      const { error: insertError } = await supabase
        .from("sync_group_repos")
        .insert(repoInserts);

      if (insertError) throw insertError;

      toast({
        title: "Repositories added",
        description: `${dbRepos.length} repository(ies) added successfully. Starting sync...`,
      });

      // Prepare repos for sync progress modal
      const syncRepos = dbRepos.map(repo => ({
        name: repo.name,
        full_name: repo.full_name,
        status: 'pending' as const,
      }));

      setReposToSync(syncRepos);
      
      // Close add dialog and show sync progress
      onOpenChange(false);
      setShowSyncProgress(true);

      // Trigger sync in background
      const { error: syncError } = await supabase.functions.invoke('sync-repos', {
        body: {
          syncGroupId,
          accountId,
          motherRepoId,
        },
      });

      if (syncError) {
        console.error('Sync error:', syncError);
        toast({
          title: "Sync started with errors",
          description: "Check the sync progress for details",
          variant: "destructive",
        });
      }

      queryClient.invalidateQueries({ queryKey: ["sync-groups"] });
      queryClient.invalidateQueries({ queryKey: ["sync-group", syncGroupId] });
      setSelectedRepos([]);
    } catch (error: any) {
      toast({
        title: "Error adding repositories",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const availableToAdd = availableRepos.filter(
    repo => !existingRepoIds.includes(repo.id.toString()) && repo.id.toString() !== motherRepoId
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Repositories to Sync Project</DialogTitle>
            <DialogDescription>
              Select repositories to add to this sync group. They will be synced immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {availableToAdd.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No additional repositories available to add
              </p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto border rounded-md p-4">
                {availableToAdd.map((repo) => (
                  <div key={repo.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`add-${repo.id}`}
                      checked={selectedRepos.includes(repo.id.toString())}
                      onCheckedChange={() => toggleRepo(repo.id.toString())}
                    />
                    <label
                      htmlFor={`add-${repo.id}`}
                      className="text-sm cursor-pointer flex-1"
                    >
                      {repo.full_name}
                    </label>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleAddRepos}
                disabled={isAdding || selectedRepos.length === 0}
                className="flex-1"
              >
                {isAdding ? "Adding & Syncing..." : `Add ${selectedRepos.length || ''} Repositories`}
              </Button>
              <Button
                onClick={() => onOpenChange(false)}
                variant="outline"
                disabled={isAdding}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SyncProgressModal
        open={showSyncProgress}
        onOpenChange={setShowSyncProgress}
        syncGroupId={syncGroupId}
        accountId={accountId}
        repos={reposToSync}
      />
    </>
  );
};
