import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Folder, GitBranch, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface SyncGroupsListProps {
  accountId: string;
  onSelectGroup: (groupId: string) => void;
  selectedGroupId: string | null;
}

const SyncGroupsList = ({ accountId, onSelectGroup, selectedGroupId }: SyncGroupsListProps) => {
  const navigate = useNavigate();
  const { data: groups, isLoading } = useQuery({
    queryKey: ["sync-groups", accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_groups")
        .select(`
          *,
          mother_repo:repos!sync_groups_mother_repo_id_fkey(name, full_name),
          sync_group_repos(
            repo:repos(name, full_name)
          )
        `)
        .eq("account_id", accountId);

      if (error) throw error;
      return data;
    },
    enabled: !!accountId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!groups || groups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sync Projects</CardTitle>
          <CardDescription>No sync projects yet</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Folder className="h-12 w-12 mb-2" />
          <p>Create a sync project to get started</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sync Projects</CardTitle>
        <CardDescription>Your repository sync groups</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.map((group) => (
          <div
            key={group.id}
            className={`border rounded-lg p-4 transition-colors ${
              selectedGroupId === group.id
                ? "border-primary bg-accent"
                : "border-border hover:border-primary/50"
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h3 className="font-semibold">{group.name}</h3>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <GitBranch className="h-4 w-4" />
                  <span>Mother: {group.mother_repo?.full_name}</span>
                </div>
              </div>
              <Badge variant="secondary">
                {group.sync_group_repos?.length || 0} repos
              </Badge>
            </div>
            {group.last_sync_time && (
              <p className="text-xs text-muted-foreground mb-3">
                Last synced: {new Date(group.last_sync_time).toLocaleString()}
              </p>
            )}
            <Button
              onClick={() => navigate(`/project/${group.id}`)}
              variant="outline"
              className="w-full"
              size="sm"
            >
              View Details
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default SyncGroupsList;
