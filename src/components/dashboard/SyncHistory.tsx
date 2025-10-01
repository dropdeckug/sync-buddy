import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, GitCommit, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SyncHistoryProps {
  accountId: string;
}

const SyncHistory = ({ accountId }: SyncHistoryProps) => {
  const { data: history, isLoading } = useQuery({
    queryKey: ["sync-history", accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_history")
        .select("*")
        .eq("account_id", accountId)
        .order("synced_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data;
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "default";
      case "failed":
        return "destructive";
      case "pending":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="w-5 h-5" />
          Sync History
        </CardTitle>
        <CardDescription>
          Recent synchronization activities
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading history...</div>
        ) : history && history.length > 0 ? (
          <div className="space-y-4">
            {history.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-lg border border-border hover:border-primary/50 transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <GitCommit className="w-4 h-4 text-primary" />
                    <span className="font-medium">{item.repo_name}</span>
                  </div>
                  <Badge variant={getStatusColor(item.status)}>
                    {item.status}
                  </Badge>
                </div>
                
                <p className="text-sm text-muted-foreground mb-3">
                  {item.commit_message}
                </p>
                
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {item.files_changed} changed
                  </div>
                  <div className="text-accent">
                    +{item.files_added}
                  </div>
                  <div className="text-destructive">
                    -{item.files_deleted}
                  </div>
                  <div className="ml-auto">
                    {formatDistanceToNow(new Date(item.synced_at), { addSuffix: true })}
                  </div>
                </div>

                {item.commit_sha && (
                  <div className="mt-2 text-xs font-mono text-muted-foreground">
                    {item.commit_sha.substring(0, 7)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 space-y-4">
            <History className="w-16 h-16 mx-auto text-muted-foreground" />
            <div>
              <p className="text-muted-foreground">No sync history yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your sync activities will appear here
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SyncHistory;
