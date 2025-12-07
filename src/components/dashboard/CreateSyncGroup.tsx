import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Webhook, Loader2 } from "lucide-react";

interface CreateSyncGroupProps {
  accountId: string;
  repos: any[];
  accessToken: string;
  onSuccess?: () => void;
}

const CreateSyncGroup = ({ accountId, repos, accessToken, onSuccess }: CreateSyncGroupProps) => {
  const [name, setName] = useState("");
  const [motherRepoId, setMotherRepoId] = useState("");
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [autoWebhooks, setAutoWebhooks] = useState(true);
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

  const handleCreateGroup = async () => {
    if (!name || !motherRepoId || selectedRepos.length === 0) {
      toast({
        title: "Missing information",
        description: "Please fill all fields and select at least one repository",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      // First ensure all repos exist in the repos table using github_id
      const allGithubRepoIds = [motherRepoId, ...selectedRepos];
      const reposToInsert = repos
        .filter(repo => allGithubRepoIds.includes(repo.id.toString()))
        .map(repo => ({
          account_id: accountId,
          name: repo.name,
          full_name: repo.full_name,
          owner: repo.owner?.login || repo.full_name?.split('/')[0] || '',
          github_id: repo.id.toString(),
          default_branch: repo.default_branch || 'main',
          is_private: repo.private || false,
        }));

      // Upsert repos to ensure they exist
      const { error: upsertError } = await supabase
        .from("repos")
        .upsert(reposToInsert, { onConflict: 'github_id' });

      if (upsertError) throw upsertError;

      // Now fetch the actual UUID ids from the database
      const { data: dbRepos, error: fetchError } = await supabase
        .from("repos")
        .select("id, github_id")
        .in("github_id", allGithubRepoIds);

      if (fetchError) throw fetchError;
      if (!dbRepos || dbRepos.length === 0) throw new Error("Failed to fetch repository IDs");

      // Create a map of github_id to database UUID
      const githubIdToUuid = dbRepos.reduce((map, repo) => {
        map[repo.github_id] = repo.id;
        return map;
      }, {} as Record<string, string>);

      const motherRepoUuid = githubIdToUuid[motherRepoId];
      if (!motherRepoUuid) throw new Error("Mother repository not found");

      // Create sync group with the UUID
      const { data: syncGroup, error: groupError } = await supabase
        .from("sync_groups")
        .insert({
          name,
          account_id: accountId,
          mother_repo_id: motherRepoUuid,
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Add repositories to sync group using UUIDs
      const repoInserts = selectedRepos
        .map(githubRepoId => {
          const uuid = githubIdToUuid[githubRepoId];
          if (!uuid) return null;
          return {
            sync_group_id: syncGroup.id,
            repo_id: uuid,
          };
        })
        .filter(Boolean);

      const { error: repoError } = await supabase
        .from("sync_group_repos")
        .insert(repoInserts);

      if (repoError) throw repoError;

      // Register webhooks if enabled
      if (autoWebhooks) {
        const allRepos = repos.filter(repo => allGithubRepoIds.includes(repo.id.toString()));
        setWebhookProgress({ registering: true, current: '', count: 0, total: allRepos.length });
        
        let successCount = 0;
        for (let i = 0; i < allRepos.length; i++) {
          const repo = allRepos[i];
          setWebhookProgress(prev => ({ ...prev, current: repo.full_name, count: i }));
          const result = await registerWebhook(repo.full_name);
          if (result?.success) successCount++;
        }
        
        setWebhookProgress({ registering: false, current: '', count: 0, total: 0 });
        
        toast({
          title: "Webhooks registered",
          description: `${successCount}/${allRepos.length} webhooks registered for auto-sync`,
        });
      }

      toast({
        title: "Success",
        description: "Sync group created successfully",
      });

      setName("");
      setMotherRepoId("");
      setSelectedRepos([]);
      queryClient.invalidateQueries({ queryKey: ["sync-groups"] });
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const toggleRepo = (repoId: string) => {
    setSelectedRepos(prev =>
      prev.includes(repoId)
        ? prev.filter(id => id !== repoId)
        : [...prev, repoId]
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="group-name" className="text-sm font-medium">Project Name</Label>
          <Input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Sync Project"
            className="bg-muted/30 border-border/50"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="mother-repo" className="text-sm font-medium">Mother Repository</Label>
          <select
            id="mother-repo"
            value={motherRepoId}
            onChange={(e) => setMotherRepoId(e.target.value)}
            className="w-full rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Select repository...</option>
            {repos.map((repo) => (
              <option key={repo.id} value={repo.id}>
                {repo.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium">Child Repositories to Sync</Label>
          <div className="space-y-2 max-h-64 overflow-y-auto border border-border/50 rounded-lg p-4 bg-muted/20">
            {repos
              .filter(repo => repo.id !== motherRepoId)
              .map((repo) => (
                <div key={repo.id} className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/30 transition-colors">
                  <Checkbox
                    id={repo.id}
                    checked={selectedRepos.includes(repo.id)}
                    onCheckedChange={() => toggleRepo(repo.id)}
                    className="border-border/50"
                  />
                  <label
                    htmlFor={repo.id}
                    className="text-sm cursor-pointer flex-1 font-medium"
                  >
                    {repo.full_name}
                  </label>
                </div>
              ))}
          </div>
        </div>

        <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg border border-border/50">
          <div className="flex items-center gap-3">
            <Webhook className="w-5 h-5 text-primary" />
            <div>
              <Label className="text-sm font-medium">Auto-register webhooks</Label>
              <p className="text-xs text-muted-foreground">Automatically sync on push events</p>
            </div>
          </div>
          <Switch 
            checked={autoWebhooks} 
            onCheckedChange={setAutoWebhooks}
          />
        </div>

        {webhookProgress.registering && (
          <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm">
              Registering webhook {webhookProgress.count + 1}/{webhookProgress.total}: {webhookProgress.current}
            </span>
          </div>
        )}

        <Button
          onClick={handleCreateGroup}
          disabled={isCreating || webhookProgress.registering}
          className="w-full mt-6"
        >
          {isCreating ? "Creating..." : webhookProgress.registering ? "Registering Webhooks..." : "Create Sync Project"}
        </Button>
      </div>
    </div>
  );
};

export default CreateSyncGroup;
