import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="w-5 h-5" />
          Select Repository
        </CardTitle>
        <CardDescription>
          Choose a repository to sync with
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="p-4 rounded-lg border-2 border-border">
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-4 rounded" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12 space-y-4">
            <AlertCircle className="w-16 h-16 mx-auto text-destructive" />
            <div>
              <p className="text-foreground font-medium">Failed to load repositories</p>
              <p className="text-sm text-muted-foreground mt-1">
                Please try reconnecting your GitHub account
              </p>
            </div>
          </div>
        ) : repos && repos.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {repos.map((repo: any) => (
              <button
                key={repo.id}
                onClick={() => onSelectRepo(repo)}
                className="p-4 rounded-lg border-2 border-border hover:border-primary/50 transition-all text-left group"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="font-semibold group-hover:text-primary transition-colors truncate">
                      {repo.name}
                    </div>
                    {repo.private && <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                  </div>
                  
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {repo.description || "No description"}
                  </p>
                  
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Star className="w-3 h-3" />
                      {repo.stars}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {repo.default_branch}
                    </Badge>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 space-y-4">
            <GitBranch className="w-16 h-16 mx-auto text-muted-foreground" />
            <div>
              <p className="text-muted-foreground">No repositories found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create a repository on GitHub to get started
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RepositorySelector;
