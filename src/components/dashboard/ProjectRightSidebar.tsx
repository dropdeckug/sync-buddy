import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, GitCommit, CheckCircle2, AlertCircle, MessageSquare, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ProjectRightSidebarProps {
  accountId: string | null;
  isLoading?: boolean;
}

const INITIAL_DISPLAY_COUNT = 5;

export function ProjectRightSidebar({ accountId, isLoading }: ProjectRightSidebarProps) {
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
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

  // Subscribe to real-time updates for sync_history
  useEffect(() => {
    if (!accountId) return;

    const channel = supabase
      .channel("project-sidebar-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sync_history",
          filter: `account_id=eq.${accountId}`,
        },
        () => {
          // Invalidate query to refetch latest data
          queryClient.invalidateQueries({ queryKey: ["sync-history-sidebar", accountId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountId, queryClient]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="w-4 h-4 text-primary" />;
      case "error":
      case "failed":
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      default:
        return <GitCommit className="w-4 h-4 text-muted-foreground" />;
    }
  };

  if (isLoading || loadingHistory) {
    return (
      <aside className="w-[350px] shrink-0 bg-card rounded-xl p-4 space-y-4">
        {/* Header Skeleton */}
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <Skeleton className="h-6 w-6 rounded" />
          <Skeleton className="h-5 w-32" />
        </div>

        {/* Trending Section Skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-3 rounded-lg bg-muted/30 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>

        {/* History Section Skeleton */}
        <div className="pt-4 space-y-3">
          <Skeleton className="h-4 w-28" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-3 rounded-lg bg-muted/30 space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </aside>
    );
  }

  const recentSuccessCount = syncHistory?.filter(h => h.status === "success").length || 0;
  const recentFailCount = syncHistory?.filter(h => h.status === "failed" || h.status === "error").length || 0;

  const activityItems = syncHistory?.slice(0, showAllActivity ? 20 : INITIAL_DISPLAY_COUNT) || [];
  const historyItems = syncHistory?.slice(showAllActivity ? 20 : INITIAL_DISPLAY_COUNT, showAllHistory ? undefined : (showAllActivity ? 20 : INITIAL_DISPLAY_COUNT) + INITIAL_DISPLAY_COUNT) || [];
  const hasMoreActivity = (syncHistory?.length || 0) > INITIAL_DISPLAY_COUNT;
  const hasMoreHistory = (syncHistory?.length || 0) > (showAllActivity ? 20 : INITIAL_DISPLAY_COUNT) + INITIAL_DISPLAY_COUNT;

  return (
    <aside className="w-[350px] shrink-0 bg-card rounded-xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center gap-3">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Activity & History</h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Stats Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-2xl font-bold text-primary">{recentSuccessCount}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Successful syncs</p>
            </div>
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <span className="text-2xl font-bold text-destructive">{recentFailCount}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Failed syncs</p>
            </div>
          </div>

          {/* What's happening section (X.com style) */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">What's happening</h4>
            {syncHistory && syncHistory.length > 0 ? (
              <div className="space-y-2">
                {activityItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer border border-transparent hover:border-border"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{getStatusIcon(item.status)}</div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium truncate">{item.repo_name}</p>
                          <Badge 
                            variant={item.status === "success" ? "default" : "destructive"}
                            className="text-xs shrink-0"
                          >
                            {item.status}
                          </Badge>
                        </div>
                        {item.commit_message && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {item.commit_message}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span>{formatDistanceToNow(new Date(item.synced_at), { addSuffix: true })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {hasMoreActivity && activityItems.length < (syncHistory?.length || 0) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground hover:text-foreground"
                    onClick={() => setShowAllActivity(!showAllActivity)}
                  >
                    {showAllActivity ? (
                      <>
                        <ChevronUp className="w-4 h-4 mr-2" />
                        Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4 mr-2" />
                        Show more
                      </>
                    )}
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No activity yet</p>
              </div>
            )}
          </div>

          {/* Sync History Section */}
          {historyItems.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Earlier activity</h4>
              <div className="space-y-2">
                {historyItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-2 rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {getStatusIcon(item.status)}
                      <span className="text-sm truncate flex-1">{item.repo_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(item.synced_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))}
                
                {hasMoreHistory && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground hover:text-foreground"
                    onClick={() => setShowAllHistory(!showAllHistory)}
                  >
                    {showAllHistory ? (
                      <>
                        <ChevronUp className="w-4 h-4 mr-2" />
                        Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4 mr-2" />
                        Show more
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
