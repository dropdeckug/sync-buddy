import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity,
  GitBranch,
  Users,
  Bell,
  Shield,
  Settings,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ActivityEntry {
  id: string;
  workspace_id: string | null;
  user_id: string | null;
  activity_type: string;
  title: string;
  description: string | null;
  resource_type: string | null;
  resource_id: string | null;
  metadata: unknown;
  created_at: string;
}

interface ActivityEntryFromDB {
  id: string;
  workspace_id: string | null;
  user_id: string | null;
  activity_type: string;
  title: string;
  description: string | null;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

const activityIcons: Record<string, any> = {
  sync: GitBranch,
  member: Users,
  notification: Bell,
  security: Shield,
  settings: Settings,
  approval: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  default: Activity,
};

const activityColors: Record<string, string> = {
  sync_completed: "bg-green-500",
  sync_failed: "bg-red-500",
  sync_started: "bg-blue-500",
  member_joined: "bg-purple-500",
  member_left: "bg-orange-500",
  approval_granted: "bg-green-500",
  approval_denied: "bg-red-500",
  secret_detected: "bg-yellow-500",
  default: "bg-gray-500",
};

interface ActivityFeedProps {
  workspaceId?: string;
  limit?: number;
  compact?: boolean;
}

export function ActivityFeed({ workspaceId, limit = 50, compact = false }: ActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchActivities();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('activity_feed')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_feed',
          filter: workspaceId ? `workspace_id=eq.${workspaceId}` : undefined,
        },
        (payload) => {
          setActivities(prev => [payload.new as ActivityEntry, ...prev].slice(0, limit));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, limit]);

  const fetchActivities = async () => {
    try {
      let query = supabase
        .from("activity_feed")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (workspaceId) {
        query = query.eq("workspace_id", workspaceId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setActivities((data || []) as ActivityEntry[]);
    } catch (error: any) {
      toast({
        title: "Error fetching activity",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getActivityIcon = (activityType: string) => {
    if (activityType.includes("sync")) return activityIcons.sync;
    if (activityType.includes("member")) return activityIcons.member;
    if (activityType.includes("notification")) return activityIcons.notification;
    if (activityType.includes("security") || activityType.includes("secret")) return activityIcons.security;
    if (activityType.includes("approval")) return activityIcons.approval;
    if (activityType.includes("error") || activityType.includes("fail")) return activityIcons.error;
    return activityIcons.default;
  };

  const getActivityColor = (activityType: string) => {
    return activityColors[activityType] || activityColors.default;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-3">
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No recent activity
          </p>
        ) : (
          activities.slice(0, 5).map((activity) => {
            const Icon = getActivityIcon(activity.activity_type);
            return (
              <div key={activity.id} className="flex items-center gap-3">
                <div className={`h-2 w-2 rounded-full ${getActivityColor(activity.activity_type)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{activity.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity Feed
            </CardTitle>
            <CardDescription>Real-time updates from your team</CardDescription>
          </div>
          <Badge variant="outline" className="gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Live
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No activity yet</h3>
            <p className="text-muted-foreground">
              Activity will appear here as your team uses the platform
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {activities.map((activity) => {
                const Icon = getActivityIcon(activity.activity_type);
                const colorClass = getActivityColor(activity.activity_type);

                return (
                  <div key={activity.id} className="flex gap-3">
                    <div className="relative">
                      <div className={`h-10 w-10 rounded-full ${colorClass} flex items-center justify-center`}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      {/* Connecting line */}
                      <div className="absolute top-10 left-1/2 w-px h-full -translate-x-1/2 bg-border" />
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{activity.title}</p>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      {activity.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {activity.description}
                        </p>
                      )}
                      {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {Object.entries(activity.metadata).slice(0, 3).map(([key, value]) => (
                            <Badge key={key} variant="secondary" className="text-xs">
                              {key}: {String(value).substring(0, 20)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
