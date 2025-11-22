import { GitBranch, Star, Lock, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RepositorySelectorProps {
  accountId: string;
  onSelectRepo: (repo: any) => void;
}

const RepositorySelector = ({ accountId, onSelectRepo }: RepositorySelectorProps) => {
  const { data: repos, isLoading, error } = useQuery({
    queryKey: ["github-repos", accountId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("github-repos", {
        body: { accountId },
      });

      if (error) throw error;
      return data.repos;
    },
    enabled: !!accountId,
  });

  if (error) {
    toast.error("Failed to load repositories");
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <GitBranch className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Available Repositories</h3>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-3 rounded-lg border border-border/30">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-4" />
                </div>
                <Skeleton className="h-3 w-full" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-8 space-y-3">
          <AlertCircle className="w-12 h-12 mx-auto text-destructive/50" />
          <div>
            <p className="text-sm text-foreground font-medium">Failed to load repositories</p>
            <p className="text-xs text-muted-foreground mt-1">
              Please try reconnecting your GitHub account
            </p>
          </div>
        </div>
      ) : repos && repos.length > 0 ? (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {repos.map((repo: any) => (
            <button
              key={repo.id}
              onClick={() => onSelectRepo(repo)}
              className="w-full p-3 rounded-lg border border-border/30 hover:border-primary/50 hover:bg-muted/20 transition-all text-left group"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-sm group-hover:text-primary transition-colors truncate flex-1">
                    {repo.name}
                  </div>
                  {repo.private && <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                </div>
                
                {repo.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {repo.description}
                  </p>
                )}
                
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Star className="w-3 h-3" />
                    <span>{repo.stars}</span>
                  </div>
                  <Badge variant="outline" className="text-xs h-5">
                    {repo.default_branch}
                  </Badge>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 space-y-3">
          <GitBranch className="w-12 h-12 mx-auto text-muted-foreground/30" />
          <div>
            <p className="text-sm text-muted-foreground">No repositories found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create a repository on GitHub to get started
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default RepositorySelector;
