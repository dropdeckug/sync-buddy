import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, GitCommit, AlertCircle, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RecentActivityProps {
  accountId: string;
}

const RecentActivity = ({ accountId }: RecentActivityProps) => {
  const { data: history, isLoading } = useQuery({
    queryKey: ["sync-history-recent", accountId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_history")
        .select("*")
        .eq("account_id", accountId)
        .order("synced_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!accountId,
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="w-4 h-4 text-primary" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      default:
        return <GitCommit className="w-4 h-4 text-muted-foreground" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-muted-foreground text-sm">Loading activity...</div>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <Clock className="w-12 h-12 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No recent activity</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        {history.map((item) => (
          <div
            key={item.id}
            className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/30"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{getStatusIcon(item.status)}</div>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm font-medium truncate">{item.repo_name}</p>
                {item.commit_message && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {item.commit_message}
                  </p>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>{formatDistanceToNow(new Date(item.synced_at), { addSuffix: true })}</span>
                </div>
                {(item.files_added || item.files_changed || item.files_deleted) && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                    {item.files_added > 0 && <span className="text-primary">+{item.files_added}</span>}
                    {item.files_changed > 0 && <span className="text-accent">~{item.files_changed}</span>}
                    {item.files_deleted > 0 && <span className="text-destructive">-{item.files_deleted}</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};

export default RecentActivity;
