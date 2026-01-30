import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedAreaChart } from "./AnimatedAreaChart";
import { AnimatedBarChart } from "./AnimatedBarChart";
import { AnimatedPieChart } from "./AnimatedPieChart";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { 
  GitCommit, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  TrendingUp,
  Activity,
  BarChart3
} from "lucide-react";
import { formatDistanceToNow, format, parseISO, getDay, getHours, subDays } from "date-fns";

interface SyncHistory {
  id: string;
  synced_at: string;
  repo_name: string;
  repo_full_name: string;
  status: string;
  files_added: number | null;
  files_changed: number | null;
  files_deleted: number | null;
  commit_sha: string | null;
  commit_message: string | null;
  error_message: string | null;
}

interface SyncAnalyticsDashboardProps {
  syncHistory: SyncHistory[];
  isLoading?: boolean;
}

export function SyncAnalyticsDashboard({ syncHistory, isLoading }: SyncAnalyticsDashboardProps) {
  // Calculate analytics
  const analytics = useMemo(() => {
    if (!syncHistory.length) return null;

    // Files synced over time (last 30 days)
    const last30Days = subDays(new Date(), 30);
    const filesOverTime: Record<string, number> = {};
    
    syncHistory.forEach(sync => {
      const date = format(parseISO(sync.synced_at), 'MMM dd');
      const totalFiles = (sync.files_added || 0) + (sync.files_changed || 0) + (sync.files_deleted || 0);
      filesOverTime[date] = (filesOverTime[date] || 0) + totalFiles;
    });

    const filesChartData = Object.entries(filesOverTime)
      .slice(-14)
      .map(([date, count]) => ({ date, files: count }));

    // Success/failure rates
    const successCount = syncHistory.filter(s => s.status === "success" || s.status === "completed").length;
    const failCount = syncHistory.filter(s => s.status === "failed" || s.status === "error").length;
    const pendingCount = syncHistory.filter(s => s.status === "pending" || s.status === "syncing").length;

    const successRateData = [
      { name: "Success", value: successCount, color: "hsl(var(--primary))" },
      { name: "Failed", value: failCount, color: "hsl(var(--destructive))" },
      { name: "Pending", value: pendingCount, color: "hsl(var(--muted-foreground))" },
    ].filter(d => d.value > 0);

    // Most frequently synced repos
    const repoFrequency: Record<string, number> = {};
    syncHistory.forEach(sync => {
      repoFrequency[sync.repo_name] = (repoFrequency[sync.repo_name] || 0) + 1;
    });

    const repoChartData = Object.entries(repoFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([repo, count]) => ({ repo, syncs: count, color: "hsl(var(--primary))" }));

    // Activity heatmap data
    const heatmapData: { day: string; hour: number; count: number }[] = [];
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    
    const activityMap: Record<string, number> = {};
    syncHistory.forEach(sync => {
      const date = parseISO(sync.synced_at);
      const day = DAYS[getDay(date)];
      const hour = getHours(date);
      const key = `${day}-${hour}`;
      activityMap[key] = (activityMap[key] || 0) + 1;
    });

    DAYS.forEach(day => {
      for (let hour = 0; hour < 24; hour++) {
        const key = `${day}-${hour}`;
        heatmapData.push({
          day,
          hour,
          count: activityMap[key] || 0,
        });
      }
    });

    // Total stats
    const totalFiles = syncHistory.reduce((acc, s) => 
      acc + (s.files_added || 0) + (s.files_changed || 0) + (s.files_deleted || 0), 0);
    const totalAdded = syncHistory.reduce((acc, s) => acc + (s.files_added || 0), 0);
    const totalChanged = syncHistory.reduce((acc, s) => acc + (s.files_changed || 0), 0);
    const totalDeleted = syncHistory.reduce((acc, s) => acc + (s.files_deleted || 0), 0);

    // Average sync rate (syncs per day)
    const syncDates = [...new Set(syncHistory.map(s => format(parseISO(s.synced_at), 'yyyy-MM-dd')))];
    const avgSyncsPerDay = syncHistory.length / Math.max(syncDates.length, 1);

    return {
      filesChartData,
      successRateData,
      repoChartData,
      heatmapData,
      totalFiles,
      totalAdded,
      totalChanged,
      totalDeleted,
      successCount,
      failCount,
      totalSyncs: syncHistory.length,
      avgSyncsPerDay: avgSyncsPerDay.toFixed(1),
      successRate: ((successCount / syncHistory.length) * 100).toFixed(1),
    };
  }, [syncHistory]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="h-[300px] rounded-xl" />
          <Skeleton className="h-[300px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Activity className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p>No sync data available yet</p>
        <p className="text-sm mt-1">Start syncing repositories to see analytics</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Syncs</p>
                <p className="text-3xl font-bold text-primary">{analytics.totalSyncs}</p>
              </div>
              <GitCommit className="h-8 w-8 text-primary/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Files Processed</p>
                <p className="text-3xl font-bold text-blue-500">{analytics.totalFiles.toLocaleString()}</p>
              </div>
              <FileText className="h-8 w-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-3xl font-bold text-green-500">{analytics.successRate}%</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg. Syncs/Day</p>
                <p className="text-3xl font-bold text-orange-500">{analytics.avgSyncsPerDay}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-orange-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* File Stats Detail */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">+{analytics.totalAdded.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Files Added</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-500">~{analytics.totalChanged.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Files Modified</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-center">
              <p className="text-2xl font-bold text-destructive">-{analytics.totalDeleted.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Files Deleted</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Files Synced Over Time */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Files Synced Over Time
            </CardTitle>
            <CardDescription>Daily file sync activity</CardDescription>
          </CardHeader>
          <CardContent>
            <AnimatedAreaChart
              data={analytics.filesChartData}
              dataKey="files"
              xAxisKey="date"
              color="hsl(142, 76%, 36%)"
              gradientId="filesGradient"
            />
          </CardContent>
        </Card>

        {/* Success/Failure Rate */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Sync Status Distribution
            </CardTitle>
            <CardDescription>Success vs failure breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <AnimatedPieChart
              data={analytics.successRateData}
              innerRadius={45}
              outerRadius={75}
            />
          </CardContent>
        </Card>
      </div>

      {/* Most Active Repos & Heatmap */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Most Active Repositories */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Most Active Repositories
            </CardTitle>
            <CardDescription>Repositories with most syncs</CardDescription>
          </CardHeader>
          <CardContent>
            <AnimatedBarChart
              data={analytics.repoChartData}
              dataKey="syncs"
              xAxisKey="repo"
              horizontal
              colors={["hsl(142, 76%, 36%)", "hsl(142, 76%, 45%)", "hsl(142, 76%, 55%)"]}
            />
          </CardContent>
        </Card>

        {/* Activity Heatmap */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Activity Heatmap
            </CardTitle>
            <CardDescription>When syncs happen most</CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityHeatmap data={analytics.heatmapData} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
