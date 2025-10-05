import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface CreateSyncGroupProps {
  accountId: string;
  repos: any[];
}

const CreateSyncGroup = ({ accountId, repos }: CreateSyncGroupProps) => {
  const [name, setName] = useState("");
  const [motherRepoId, setMotherRepoId] = useState("");
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      // Create sync group
      const { data: syncGroup, error: groupError } = await supabase
        .from("sync_groups")
        .insert({
          name,
          account_id: accountId,
          mother_repo_id: motherRepoId,
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Add repositories to sync group
      const repoInserts = selectedRepos.map(repoId => ({
        sync_group_id: syncGroup.id,
        repo_id: repoId,
      }));

      const { error: repoError } = await supabase
        .from("sync_group_repos")
        .insert(repoInserts);

      if (repoError) throw repoError;

      toast({
        title: "Success",
        description: "Sync group created successfully",
      });

      setName("");
      setMotherRepoId("");
      setSelectedRepos([]);
      queryClient.invalidateQueries({ queryKey: ["sync-groups"] });
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
    <Card>
      <CardHeader>
        <CardTitle>Create Sync Project</CardTitle>
        <CardDescription>
          Select a mother repository and child repositories to sync together
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="group-name">Project Name</Label>
          <Input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Sync Project"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="mother-repo">Mother Repository</Label>
          <select
            id="mother-repo"
            value={motherRepoId}
            onChange={(e) => setMotherRepoId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2"
          >
            <option value="">Select repository...</option>
            {repos.map((repo) => (
              <option key={repo.id} value={repo.id}>
                {repo.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label>Child Repositories to Sync</Label>
          <div className="space-y-2 max-h-64 overflow-y-auto border rounded-md p-4">
            {repos
              .filter(repo => repo.id !== motherRepoId)
              .map((repo) => (
                <div key={repo.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={repo.id}
                    checked={selectedRepos.includes(repo.id)}
                    onCheckedChange={() => toggleRepo(repo.id)}
                  />
                  <label
                    htmlFor={repo.id}
                    className="text-sm cursor-pointer flex-1"
                  >
                    {repo.full_name}
                  </label>
                </div>
              ))}
          </div>
        </div>

        <Button
          onClick={handleCreateGroup}
          disabled={isCreating}
          className="w-full"
        >
          {isCreating ? "Creating..." : "Create Sync Project"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default CreateSyncGroup;
