import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, AlertCircle, GitBranch, Activity, TrendingUp, Clock
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface DashboardAnalyticsProps {
  accountId: string;
}

export function DashboardAnalytics({ accountId }: DashboardAnalyticsProps) {
  const { data: syncHistory } = useQuery({
    queryKey: ["dashboard-analytics", accountId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_history")
        .select("*")
        .eq("account_id", accountId)
        .order("synced_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: !!accountId,
  });

  const { data: syncGroups } = useQuery({
    queryKey: ["dashboard-analytics-groups", accountId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_groups")
        .select("id, name, last_sync_time, auto_sync_enabled")
        .eq("account_id", accountId);
      return data || [];
    },
    enabled: !!accountId,
  });

  const { data: repos } = useQuery({
    queryKey: ["dashboard-analytics-repos", accountId],
    queryFn: async () => {
      const { data } = await supabase
        .from("repos")
        .select("id")
        .eq("account_id", accountId);
      return data || [];
    },
    enabled: !!accountId,
  });

  if (!syncHistory) return null;

  const totalSyncs = syncHistory.length;
  const successSyncs = syncHistory.filter(h => h.status === "success").length;
  const failedSyncs = syncHistory.filter(h => h.status === "failed" || h.status === "error").length;
  const successRate = totalSyncs > 0 ? Math.round((successSyncs / totalSyncs) * 100) : 0;
  const totalFilesAdded = syncHistory.reduce((sum, h) => sum + (h.files_added || 0), 0);
  const totalFilesChanged = syncHistory.reduce((sum, h) => sum + (h.files_changed || 0), 0);
  const totalFilesDeleted = syncHistory.reduce((sum, h) => sum + (h.files_deleted || 0), 0);
  const lastSync = syncHistory[0];

  // Recent 7 days activity
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recentSyncs = syncHistory.filter(h => new Date(h.synced_at).getTime() > sevenDaysAgo);

  // Daily breakdown for mini chart
  const dailyCounts = Array.from({ length: 7 }, (_, i) => {
    const dayStart = new Date(now - (6 - i) * 24 * 60 * 60 * 1000);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    return syncHistory.filter(h => {
      const d = new Date(h.synced_at).getTime();
      return d >= dayStart.getTime() && d < dayEnd.getTime();
    }).length;
  });
  const maxDaily = Math.max(...dailyCounts, 1);

  return (
    <div className="space-y-3">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard
          icon={<Activity className="w-3.5 h-3.5 text-primary" />}
          value={totalSyncs.toString()}
          label="Total Syncs"
        />
        <StatCard
          icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
          value={`${successRate}%`}
          label="Success Rate"
          accent={successRate >= 80 ? "emerald" : successRate >= 50 ? "amber" : "red"}
        />
        <StatCard
          icon={<GitBranch className="w-3.5 h-3.5 text-blue-400" />}
          value={(repos?.length || 0).toString()}
          label="Repositories"
        />
        <StatCard
          icon={<TrendingUp className="w-3.5 h-3.5 text-purple-400" />}
          value={(syncGroups?.length || 0).toString()}
          label="Projects"
        />
      </div>

      {/* Mini activity chart + details */}
      <div className="grid grid-cols-2 gap-2">
        {/* 7-day chart */}
        <div className="p-3 rounded-xl bg-card/50 border border-border/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">7-Day Activity</span>
            <Badge variant="secondary" className="text-[9px] px-1 py-0">{recentSyncs.length} syncs</Badge>
          </div>
          <div className="flex items-end gap-1 h-10">
            {dailyCounts.map((count, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div
                  className="w-full rounded-sm bg-primary/60 min-h-[2px] transition-all"
                  style={{ height: `${Math.max((count / maxDaily) * 100, 5)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].slice(0, 7).map((d, i) => (
              <span key={i} className="text-[8px] text-muted-foreground/40 flex-1 text-center">{d}</span>
            ))}
          </div>
        </div>

        {/* File stats */}
        <div className="p-3 rounded-xl bg-card/50 border border-border/30">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Files Synced</span>
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Added</span>
              <span className="text-xs font-mono font-semibold text-primary">+{totalFilesAdded}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Changed</span>
              <span className="text-xs font-mono font-semibold text-amber-400">~{totalFilesChanged}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Deleted</span>
              <span className="text-xs font-mono font-semibold text-destructive">-{totalFilesDeleted}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent failures */}
      {failedSyncs > 0 && (
        <div className="p-2.5 rounded-xl bg-destructive/8 border border-destructive/15">
          <div className="flex items-center gap-2 mb-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-destructive" />
            <span className="text-[10px] font-semibold text-destructive">{failedSyncs} Failed Syncs</span>
          </div>
          {syncHistory.filter(h => h.status === "failed" || h.status === "error").slice(0, 2).map(h => (
            <div key={h.id} className="text-[10px] text-destructive/70 truncate pl-5">
              {h.repo_name}: {h.error_message?.slice(0, 60) || 'Unknown error'}
            </div>
          ))}
        </div>
      )}

      {/* Last sync */}
      {lastSync && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Last sync {formatDistanceToNow(new Date(lastSync.synced_at), { addSuffix: true })}
          </span>
          <Badge variant={lastSync.status === 'success' ? 'default' : 'destructive'} className="text-[9px] px-1.5 py-0">
            {lastSync.status}
          </Badge>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, value, label, accent }: { icon: React.ReactNode; value: string; label: string; accent?: string }) {
  return (
    <div className="p-2.5 rounded-xl bg-card/50 border border-border/30">
      <div className="flex items-center gap-1.5 mb-1">{icon}</div>
      <p className={`text-lg font-bold ${accent === 'emerald' ? 'text-emerald-400' : accent === 'amber' ? 'text-amber-400' : accent === 'red' ? 'text-destructive' : 'text-foreground'}`}>
        {value}
      </p>
      <p className="text-[9px] text-muted-foreground">{label}</p>
    </div>
  );
}
