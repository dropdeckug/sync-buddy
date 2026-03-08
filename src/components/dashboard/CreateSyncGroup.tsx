import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Webhook, Loader2, ArrowRight, GitBranch, Clock, Zap,
  CheckCircle2, Circle, Search, Shield, Rocket, ArrowDown
} from "lucide-react";

const MAX_REPOS = 15;

interface CreateSyncGroupProps {
  accountId: string;
  repos: any[];
  accessToken: string;
  onSuccess?: () => void;
}

const CreateSyncGroup = ({ accountId, repos, accessToken, onSuccess }: CreateSyncGroupProps) => {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [motherRepoId, setMotherRepoId] = useState("");
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [autoWebhooks, setAutoWebhooks] = useState(true);
  const [autoSyncAfterCreate, setAutoSyncAfterCreate] = useState(true);
  const [repoSearch, setRepoSearch] = useState("");
  const [webhookProgress, setWebhookProgress] = useState({
    registering: false, current: '', count: 0, total: 0,
  });
  const [creationComplete, setCreationComplete] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const motherRepo = repos.find(r => r.id.toString() === motherRepoId);
  const childRepos = repos.filter(r => r.id.toString() !== motherRepoId);
  const filteredChildRepos = childRepos.filter(r =>
    r.full_name.toLowerCase().includes(repoSearch.toLowerCase())
  );

  const estimatedSyncTime = useMemo(() => {
    const count = selectedRepos.length;
    if (count === 0) return null;
    const seconds = count * 8 + 5;
    if (seconds < 60) return `~${seconds}s`;
    return `~${Math.ceil(seconds / 60)}m`;
  }, [selectedRepos.length]);

  const repoCount = selectedRepos.length;
  const isAtLimit = repoCount >= MAX_REPOS;

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
    setSelectedRepos(prev => {
      if (prev.includes(repoId)) return prev.filter(id => id !== repoId);
      if (prev.length >= MAX_REPOS) {
        toast({ title: "Limit reached", description: `Maximum ${MAX_REPOS} repositories per project`, variant: "destructive" });
        return prev;
      }
      return [...prev, repoId];
    });
  };

  const canProceedStep1 = name.trim().length > 0 && motherRepoId;
  const canProceedStep2 = selectedRepos.length > 0;

  const handleCreateGroup = async () => {
    setIsCreating(true);
    try {
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

      const { error: upsertError } = await supabase
        .from("repos")
        .upsert(reposToInsert, { onConflict: 'github_id' });
      if (upsertError) throw upsertError;

      const { data: dbRepos, error: fetchError } = await supabase
        .from("repos")
        .select("id, github_id")
        .in("github_id", allGithubRepoIds);
      if (fetchError) throw fetchError;
      if (!dbRepos || dbRepos.length === 0) throw new Error("Failed to fetch repository IDs");

      const githubIdToUuid = dbRepos.reduce((map, repo) => {
        map[repo.github_id] = repo.id;
        return map;
      }, {} as Record<string, string>);

      const motherRepoUuid = githubIdToUuid[motherRepoId];
      if (!motherRepoUuid) throw new Error("Mother repository not found");

      const { data: syncGroup, error: groupError } = await supabase
        .from("sync_groups")
        .insert({ name, account_id: accountId, mother_repo_id: motherRepoUuid })
        .select()
        .single();
      if (groupError) throw groupError;

      const repoInserts = selectedRepos
        .map(githubRepoId => {
          const uuid = githubIdToUuid[githubRepoId];
          if (!uuid) return null;
          return { sync_group_id: syncGroup.id, repo_id: uuid };
        })
        .filter(Boolean);

      const { error: repoError } = await supabase
        .from("sync_group_repos")
        .insert(repoInserts);
      if (repoError) throw repoError;

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
        if (successCount > 0) {
          toast({ title: "Webhooks registered", description: `${successCount}/${allRepos.length} webhooks active` });
        }
      }

      setCreationComplete(true);
      queryClient.invalidateQueries({ queryKey: ["sync-groups"] });
      toast({ title: "Project created!", description: `${name} is ready with ${selectedRepos.length} repositories` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  // Step indicator
  const StepIndicator = () => (
    <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
      {[
        { num: 1, label: "Setup" },
        { num: 2, label: "Repositories" },
        { num: 3, label: "Review & Create" },
      ].map((s, i) => (
        <div key={s.num} className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              if (s.num < step) setStep(s.num);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
              step === s.num
                ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                : step > s.num
                ? "bg-primary/20 text-primary cursor-pointer"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {step > s.num ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
            {s.label}
          </button>
          {i < 2 && <ArrowRight className="hidden sm:block w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );

  // Sync visualization
  const SyncVisualization = () => {
    if (!motherRepo || selectedRepos.length === 0) return null;
    const selectedChildRepos = repos.filter(r => selectedRepos.includes(r.id.toString()));

    return (
      <div className="bg-card/50 border border-border/30 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Sync Flow Preview</h4>
        <div className="flex flex-col items-center gap-2">
          {/* Mother repo */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/15 border border-primary/30 rounded-lg w-full max-w-xs">
            <GitBranch className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-primary truncate">{motherRepo.full_name}</p>
              <p className="text-[10px] text-primary/60">Source</p>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex flex-col items-center gap-0.5">
            <ArrowDown className="w-4 h-4 text-primary animate-pulse" />
            <span className="text-[10px] text-muted-foreground">syncs to</span>
          </div>

          {/* Child repos */}
          <div className="grid grid-cols-2 gap-2 w-full">
            {selectedChildRepos.slice(0, 6).map(repo => (
              <div key={repo.id} className="flex items-center gap-2 px-3 py-2 bg-muted/40 border border-border/30 rounded-lg">
                <GitBranch className="w-3 h-3 text-muted-foreground shrink-0" />
                <p className="text-[11px] text-foreground/80 truncate">{repo.name}</p>
              </div>
            ))}
            {selectedChildRepos.length > 6 && (
              <div className="flex items-center justify-center px-3 py-2 bg-muted/20 border border-border/20 rounded-lg">
                <p className="text-[11px] text-muted-foreground">+{selectedChildRepos.length - 6} more</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (creationComplete) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-6">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-primary" />
        </div>
        <div className="text-center">
          <h3 className="text-xl font-bold text-foreground">{name}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Project created with {selectedRepos.length} {selectedRepos.length === 1 ? 'repository' : 'repositories'}
          </p>
        </div>

        <div className="w-full max-w-sm space-y-3">
          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border/30">
            <Zap className="w-4 h-4 text-primary" />
            <div className="flex-1">
              <p className="text-xs font-medium">Auto-sync</p>
              <p className="text-[10px] text-muted-foreground">{autoWebhooks ? "Webhooks active — syncs on push" : "Manual sync only"}</p>
            </div>
            <Badge variant="secondary" className="text-[10px]">{autoWebhooks ? "ON" : "OFF"}</Badge>
          </div>

          {autoSyncAfterCreate && (
            <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
              <Rocket className="w-4 h-4 text-primary" />
              <div className="flex-1">
                <p className="text-xs font-medium text-primary">Initial sync queued</p>
                <p className="text-[10px] text-muted-foreground">Will sync all repos from source</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-2">
          <Button variant="outline" onClick={onSuccess} className="rounded-lg">
            Close
          </Button>
          <Button onClick={onSuccess} className="rounded-lg gap-2">
            <Rocket className="w-4 h-4" />
            Go to Project
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <StepIndicator />

      {/* Step 1: Name & Mother Repo */}
      {step === 1 && (
        <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="space-y-2">
            <Label htmlFor="group-name" className="text-sm font-medium">Project Name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Design System Sync"
              className="bg-muted/30 border-border/50 h-11 text-base"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Source Repository (Mother)</Label>
            <p className="text-xs text-muted-foreground">This repo's code will be synced to all child repos</p>
            <ScrollArea className="h-48 border border-border/30 rounded-xl bg-muted/10 p-1">
              {repos.map(repo => (
                <button
                  key={repo.id}
                  onClick={() => setMotherRepoId(repo.id.toString())}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all mb-0.5 ${
                    motherRepoId === repo.id.toString()
                      ? "bg-primary/15 border border-primary/30 text-primary"
                      : "hover:bg-muted/40 border border-transparent"
                  }`}
                >
                  <GitBranch className={`w-4 h-4 shrink-0 ${motherRepoId === repo.id.toString() ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{repo.full_name}</p>
                    <p className="text-[10px] text-muted-foreground">{repo.default_branch || 'main'} · {repo.private ? 'Private' : 'Public'}</p>
                  </div>
                  {motherRepoId === repo.id.toString() && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                </button>
              ))}
            </ScrollArea>
          </div>

          <Button
            onClick={() => setStep(2)}
            disabled={!canProceedStep1}
            className="w-full h-11 rounded-lg gap-2"
          >
            Continue <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Step 2: Select Child Repos */}
      {step === 2 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <Label className="text-sm font-medium">Select Child Repositories</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Code from <span className="text-primary font-medium">{motherRepo?.name}</span> will sync here</p>
            </div>
            <Badge variant={isAtLimit ? "destructive" : "secondary"} className="text-xs font-mono shrink-0">
              {repoCount}/{MAX_REPOS}
            </Badge>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={repoSearch}
              onChange={e => setRepoSearch(e.target.value)}
              placeholder="Search repositories..."
              className="pl-9 bg-muted/30 border-border/50 h-9"
            />
          </div>

          {isAtLimit && (
            <div className="flex items-center gap-2 p-2.5 bg-destructive/10 border border-destructive/20 rounded-lg">
              <Shield className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-xs text-destructive">Maximum {MAX_REPOS} repos reached. Remove a repo to add another.</p>
            </div>
          )}

          <ScrollArea className="h-52 border border-border/30 rounded-xl bg-muted/10 p-1">
            {filteredChildRepos.map(repo => {
              const isSelected = selectedRepos.includes(repo.id.toString());
              return (
                <div
                  key={repo.id}
                  onClick={() => toggleRepo(repo.id.toString())}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all mb-0.5 ${
                    isSelected
                      ? "bg-primary/10 border border-primary/20"
                      : "hover:bg-muted/40 border border-transparent"
                  }`}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleRepo(repo.id.toString())}
                    className="border-border/50"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{repo.full_name}</p>
                    <p className="text-[10px] text-muted-foreground">{repo.default_branch || 'main'} · {repo.private ? 'Private' : 'Public'}</p>
                  </div>
                </div>
              );
            })}
          </ScrollArea>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1 rounded-lg">Back</Button>
            <Button onClick={() => setStep(3)} disabled={!canProceedStep2} className="flex-1 rounded-lg gap-2">
              Continue <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Create */}
      {step === 3 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Config */}
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-card/50 border border-border/30 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project Summary</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-xs text-muted-foreground">Name</span>
                    <span className="text-sm font-medium truncate max-w-[170px] text-right">{name}</span>
                  </div>
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-xs text-muted-foreground">Source</span>
                    <span className="text-xs font-medium text-primary truncate max-w-[170px] text-right">{motherRepo?.full_name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Targets</span>
                    <Badge variant="secondary" className="text-xs">{repoCount} repos</Badge>
                  </div>
                  {estimatedSyncTime && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Est. sync time</span>
                      <span className="text-xs font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3 text-primary" />
                        {estimatedSyncTime}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Options */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border/30">
                  <div className="flex items-center gap-2.5">
                    <Webhook className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-xs font-medium">Auto-register webhooks</p>
                      <p className="text-[10px] text-muted-foreground">Sync on every push event</p>
                    </div>
                  </div>
                  <Switch checked={autoWebhooks} onCheckedChange={setAutoWebhooks} />
                </div>

                <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border/30">
                  <div className="flex items-center gap-2.5">
                    <Rocket className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-xs font-medium">Sync immediately after creation</p>
                      <p className="text-[10px] text-muted-foreground">Run initial sync right away</p>
                    </div>
                  </div>
                  <Switch checked={autoSyncAfterCreate} onCheckedChange={setAutoSyncAfterCreate} />
                </div>
              </div>
            </div>

            {/* Right: Visualization */}
            <SyncVisualization />
          </div>

          {webhookProgress.registering && (
            <div className="space-y-2 p-3 bg-primary/10 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-xs">
                  Registering webhook {webhookProgress.count + 1}/{webhookProgress.total}
                </span>
              </div>
              <Progress value={((webhookProgress.count + 1) / webhookProgress.total) * 100} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground truncate">{webhookProgress.current}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="outline" onClick={() => setStep(2)} className="flex-1 rounded-lg">Back</Button>
            <Button
              onClick={handleCreateGroup}
              disabled={isCreating || webhookProgress.registering}
              className="flex-1 rounded-lg gap-2 h-11"
            >
              {isCreating ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
              ) : (
                <><Zap className="w-4 h-4" /> Create Project</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateSyncGroup;
