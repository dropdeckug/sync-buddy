import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Clock, CheckCircle2, AlertCircle, TrendingUp,
  ChevronDown, ChevronUp, Activity, GitCommit
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ProjectRightSidebarProps {
  accountId: string | null;
  isLoading?: boolean;
}

const INITIAL_COUNT = 5;

export function ProjectRightSidebar({ accountId, isLoading }: ProjectRightSidebarProps) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const { data: syncHistory, isLoading: loadingHistory } = useQuery({
    queryKey: ["sync-history-sidebar", accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const { data } = await supabase
        .from("sync_history")
        .select("*")
        .eq("account_id", accountId)
        .order("synced_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!accountId,
  });

  useEffect(() => {
    if (!accountId) return;
    const channel = supabase
      .channel("project-sidebar-realtime")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "sync_history",
        filter: `account_id=eq.${accountId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ["sync-history-sidebar", accountId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [accountId, queryClient]);

  if (isLoading || loadingHistory) {
    return (
      <aside className="w-[300px] shrink-0 bg-card/50 border border-border/30 rounded-2xl p-4 space-y-4">
        <Skeleton className="h-5 w-32" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
      </aside>
    );
  }

  const successCount = syncHistory?.filter(h => h.status === "success").length || 0;
  const failCount = syncHistory?.filter(h => h.status === "failed" || h.status === "error").length || 0;
  const items = expanded ? syncHistory : syncHistory?.slice(0, INITIAL_COUNT);
  const hasMore = (syncHistory?.length || 0) > INITIAL_COUNT;

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "success") return <CheckCircle2 className="w-3.5 h-3.5 text-primary" />;
    if (status === "failed" || status === "error") return <AlertCircle className="w-3.5 h-3.5 text-destructive" />;
    return <GitCommit className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  return (
    <aside className="w-full md:w-[300px] shrink-0 bg-card/50 md:border border-border/30 md:rounded-2xl flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div className="px-4 py-3.5 flex items-center gap-2.5">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">Activity</h3>
      </div>

      <Separator className="bg-border/20" />

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-xl bg-primary/8 border border-primary/15">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                <span className="text-xl font-bold text-primary">{successCount}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Successful</p>
            </div>
            <div className="p-3 rounded-xl bg-destructive/8 border border-destructive/15">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                <span className="text-xl font-bold text-destructive">{failCount}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Failed</p>
            </div>
          </div>

          {/* Timeline */}
          <div>
            <h4 className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-2 px-1">Timeline</h4>
            {items && items.length > 0 ? (
              <div className="space-y-1">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-lg hover:bg-muted/30 transition-all group"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 shrink-0"><StatusIcon status={item.status} /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <p className="text-xs font-medium truncate max-w-full">{item.repo_name}</p>
                          <Badge
                            variant={item.status === "success" ? "default" : "destructive"}
                            className="text-[9px] px-1 py-0 h-4 shrink-0"
                          >
                            {item.status}
                          </Badge>
                        </div>
                        {item.commit_message && (
                          <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5 break-words">
                            {item.commit_message}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Clock className="w-2.5 h-2.5 text-muted-foreground/50" />
                          <span className="text-[10px] text-muted-foreground/60">
                            {formatDistanceToNow(new Date(item.synced_at), { addSuffix: true })}
                          </span>
                          {(item.files_added || item.files_changed || item.files_deleted) && (
                            <span className="text-[10px] text-muted-foreground/40 break-words">
                              · +{item.files_added || 0} ~{item.files_changed || 0} -{item.files_deleted || 0}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {hasMore && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-8 text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => setExpanded(!expanded)}
                  >
                    {expanded ? <><ChevronUp className="w-3 h-3 mr-1" /> Show less</> : <><ChevronDown className="w-3 h-3 mr-1" /> Show all ({syncHistory?.length})</>}
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <TrendingUp className="h-6 w-6 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No activity yet</p>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}
