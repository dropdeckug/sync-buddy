import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { SyncProgressModal } from "./SyncProgressModal";
import {
  Webhook, Loader2, Plus, Search, GitBranch, Shield,
  Globe, CheckCircle2, Zap, FolderGit2
} from "lucide-react";

interface AddReposToGroupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syncGroupId: string;
  accountId: string;
  motherRepoId: string;
  existingRepoIds: string[];
  availableRepos: any[];
  accessToken: string;
}

export const AddReposToGroup = ({
  open,
  onOpenChange,
  syncGroupId,
  accountId,
  motherRepoId,
  existingRepoIds,
  availableRepos,
  accessToken,
}: AddReposToGroupProps) => {
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [showSyncProgress, setShowSyncProgress] = useState(false);
  const [reposToSync, setReposToSync] = useState<any[]>([]);
  const [autoWebhooks, setAutoWebhooks] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [webhookProgress, setWebhookProgress] = useState<{registering: boolean; current: string; count: number; total: number}>({
    registering: false,
    current: '',
    count: 0,
    total: 0,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const registerWebhook = async (repoFullName: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('register-webhook', {
        body: { repoFullName, accessToken, action: 'register' },
      });
      if (error) throw error;
      return data;
    } catch (err) {
      console.error(`Failed to register webhook for ${repoFullName}:`, err);
      return { success: false, error: err };
    }
  };

  const toggleRepo = (repoId: string) => {
    setSelectedRepos(prev =>
      prev.includes(repoId)
        ? prev.filter(id => id !== repoId)
        : [...prev, repoId]
    );
  };

  const handleAddRepos = async () => {
    if (selectedRepos.length === 0) {
      toast({ title: "No repositories selected", description: "Please select at least one repository to add", variant: "destructive" });
      return;
    }

    setIsAdding(true);
    try {
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

      const { data: dbRepos, error: fetchError } = await supabase
        .from("repos")
        .select("id, github_id, name, full_name")
        .in("github_id", selectedRepos);
      if (fetchError) throw fetchError;
      if (!dbRepos || dbRepos.length === 0) throw new Error("Failed to fetch repository IDs");

      const repoInserts = dbRepos.map(repo => ({ sync_group_id: syncGroupId, repo_id: repo.id }));
      const { error: insertError } = await supabase.from("sync_group_repos").insert(repoInserts);
      if (insertError) throw insertError;

      if (autoWebhooks) {
        const reposForWebhooks = reposToInsert;
        setWebhookProgress({ registering: true, current: '', count: 0, total: reposForWebhooks.length });
        let successCount = 0;
        for (let i = 0; i < reposForWebhooks.length; i++) {
          const repo = reposForWebhooks[i];
          setWebhookProgress(prev => ({ ...prev, current: repo.full_name, count: i + 1 }));
          const result = await registerWebhook(repo.full_name);
          if (result?.success) successCount++;
        }
        setWebhookProgress({ registering: false, current: '', count: 0, total: 0 });
        if (successCount > 0) {
          toast({ title: "Webhooks registered", description: `${successCount}/${reposForWebhooks.length} webhooks registered for auto-sync` });
        }
      }

      toast({ title: "Repositories added", description: `${dbRepos.length} repository(ies) added successfully. Starting sync...` });

      const syncRepos = dbRepos.map(repo => ({ name: repo.name, full_name: repo.full_name, status: 'pending' as const }));
      setReposToSync(syncRepos);
      onOpenChange(false);
      setShowSyncProgress(true);

      const { error: syncError } = await supabase.functions.invoke('sync-repos', {
        body: { syncGroupId, accountId, motherRepoId },
      });
      if (syncError) {
        console.error('Sync error:', syncError);
        toast({ title: "Sync started with errors", description: "Check the sync progress for details", variant: "destructive" });
      }

      queryClient.invalidateQueries({ queryKey: ["sync-groups"] });
      queryClient.invalidateQueries({ queryKey: ["sync-group", syncGroupId] });
      setSelectedRepos([]);
    } catch (error: any) {
      toast({ title: "Error adding repositories", description: error.message, variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  const availableToAdd = availableRepos.filter(
    repo => !existingRepoIds.includes(repo.id.toString()) && repo.id.toString() !== motherRepoId
  );

  const filteredRepos = availableToAdd.filter(repo =>
    repo.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const webhookPct = webhookProgress.total > 0
    ? Math.round((webhookProgress.count / webhookProgress.total) * 100)
    : 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100%-1rem)] sm:w-full max-w-2xl max-h-[90vh] sm:max-h-[85vh] flex flex-col p-0 gap-0 rounded-2xl border-border/40 bg-card/95 backdrop-blur-xl">
          {/* Header */}
          <DialogHeader className="px-6 py-5 border-b border-border/30 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">Add Repositories</DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  Select repositories to sync with this project
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Search */}
          <div className="px-6 py-3 border-b border-border/20 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search repositories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9 bg-muted/30 border-border/30 rounded-xl text-sm"
              />
            </div>
            {selectedRepos.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <Badge className="text-[10px] bg-primary/15 text-primary border-0 gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {selectedRepos.length} selected
                </Badge>
                <button
                  onClick={() => setSelectedRepos([])}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          {/* Repository List */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-4 py-2">
              {filteredRepos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-muted/20 flex items-center justify-center">
                    <FolderGit2 className="w-6 h-6 text-muted-foreground/30" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {searchQuery ? "No matching repositories" : "No additional repositories available"}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredRepos.map((repo) => {
                    const isSelected = selectedRepos.includes(repo.id.toString());
                    return (
                      <button
                        key={repo.id}
                        onClick={() => toggleRepo(repo.id.toString())}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                          isSelected
                            ? "bg-primary/10 border border-primary/25"
                            : "hover:bg-muted/30 border border-transparent"
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          className="pointer-events-none"
                        />
                        <div className="h-8 w-8 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
                          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{repo.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{repo.full_name}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {repo.private ? (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 gap-0.5">
                              <Shield className="w-2.5 h-2.5" /> Private
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 gap-0.5 text-muted-foreground">
                              <Globe className="w-2.5 h-2.5" /> Public
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>

          <Separator className="bg-border/20" />

          {/* Options & Actions */}
          <div className="px-6 py-4 space-y-3 shrink-0">
            {/* Auto-webhooks toggle */}
            <div className="flex items-center justify-between p-3 bg-muted/20 rounded-xl border border-border/30">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Auto-register webhooks</Label>
                  <p className="text-[10px] text-muted-foreground">Enable instant sync on push events</p>
                </div>
              </div>
              <Switch checked={autoWebhooks} onCheckedChange={setAutoWebhooks} />
            </div>

            {/* Webhook progress */}
            {webhookProgress.registering && (
              <div className="p-3 bg-primary/5 rounded-xl border border-primary/20 space-y-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  <span className="text-xs font-medium">Registering webhooks...</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{webhookProgress.count}/{webhookProgress.total}</span>
                </div>
                <Progress value={webhookPct} className="h-1" />
                <p className="text-[10px] text-muted-foreground truncate">{webhookProgress.current}</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isAdding || webhookProgress.registering}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddRepos}
                disabled={isAdding || selectedRepos.length === 0 || webhookProgress.registering}
                className="flex-1 rounded-xl gap-2 font-semibold"
              >
                {isAdding ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Adding...</>
                ) : webhookProgress.registering ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Registering...</>
                ) : (
                  <><Plus className="w-4 h-4" /> Add {selectedRepos.length || ''} {selectedRepos.length === 1 ? 'Repository' : 'Repositories'}</>
                )}
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
        initialRepos={reposToSync}
      />
    </>
  );
};
