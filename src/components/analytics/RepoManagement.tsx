import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Trash2, 
  Power, 
  PowerOff, 
  GitBranch, 
  Eye,
  MoreVertical,
  ExternalLink
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Repo {
  id: string;
  repo: {
    id: string;
    name: string;
    full_name: string;
    default_branch: string;
    is_private: boolean;
  };
}

interface RepoManagementProps {
  syncGroupId: string;
  childRepos: Repo[];
  isLoading?: boolean;
  onViewRepo: (repo: any) => void;
}

export function RepoManagement({ 
  syncGroupId, 
  childRepos, 
  isLoading,
  onViewRepo 
}: RepoManagementProps) {
  const [repoToRemove, setRepoToRemove] = useState<Repo | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleRemoveRepo = async () => {
    if (!repoToRemove) return;

    setIsRemoving(true);
    try {
      const { error } = await supabase
        .from("sync_group_repos")
        .delete()
        .eq("id", repoToRemove.id);

      if (error) throw error;

      toast({
        title: "Repository Removed",
        description: `${repoToRemove.repo.name} has been removed from the sync group.`,
      });

      queryClient.invalidateQueries({ queryKey: ["sync-group-repos", syncGroupId] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsRemoving(false);
      setRepoToRemove(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Repository Management
          </CardTitle>
          <CardDescription>
            Manage child repositories in this sync group. Remove or disable repos as needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {childRepos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <GitBranch className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No child repositories in this sync group</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {childRepos.map((cr) => (
                  <div
                    key={cr.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border hover:border-primary/30 transition-colors group"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <GitBranch className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{cr.repo.name}</p>
                          {cr.repo.is_private && (
                            <Badge variant="outline" className="text-xs">Private</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{cr.repo.full_name}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="text-xs">
                        {cr.repo.default_branch}
                      </Badge>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onViewRepo(cr.repo)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Browse Files
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => window.open(`https://github.com/${cr.repo.full_name}`, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Open on GitHub
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => setRepoToRemove(cr)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove from Group
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Remove Confirmation Dialog */}
      <AlertDialog open={!!repoToRemove} onOpenChange={() => setRepoToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Repository?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{repoToRemove?.repo.name}</strong> from this sync group?
              The repository will no longer be synced with the mother repository.
              This action doesn't delete the repository from GitHub.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRemoveRepo}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving ? "Removing..." : "Remove Repository"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
