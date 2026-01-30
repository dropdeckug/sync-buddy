import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  BarChart3, 
  Code, 
  Activity, 
  Settings2, 
  ArrowLeft,
  TrendingUp 
} from "lucide-react";

import { SyncAnalyticsDashboard } from "./SyncAnalyticsDashboard";
import { CodeMetricsDashboard } from "./CodeMetricsDashboard";
import { RepoManagement } from "./RepoManagement";

interface ProjectAnalyticsPageProps {
  syncGroupId: string;
  accountId: string;
  childRepos: any[];
  onViewRepo: (repo: any) => void;
  onBack: () => void;
}

export function ProjectAnalyticsPage({ 
  syncGroupId, 
  accountId, 
  childRepos,
  onViewRepo,
  onBack 
}: ProjectAnalyticsPageProps) {
  const [activeTab, setActiveTab] = useState("sync");

  // Fetch sync history for analytics
  const { data: syncHistory, isLoading: loadingHistory } = useQuery({
    queryKey: ["sync-history-analytics", accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const { data } = await supabase
        .from("sync_history")
        .select("*")
        .eq("account_id", accountId)
        .order("synced_at", { ascending: false })
        .limit(500);
      return data || [];
    },
    enabled: !!accountId,
  });

  // Extract repos for code metrics
  const repos = childRepos?.map(cr => cr.repo) || [];

  return (
    <div className="flex-1 min-w-0 bg-card rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-primary" />
              Project Analytics
            </h1>
            <p className="text-muted-foreground">
              Insights, metrics, and repository management
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="px-6 pt-4 border-b border-border">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="sync" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Sync Analytics
            </TabsTrigger>
            <TabsTrigger value="code" className="gap-2">
              <Code className="h-4 w-4" />
              Code Metrics
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-2">
              <Activity className="h-4 w-4" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="manage" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Manage Repos
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-6">
            <TabsContent value="sync" className="m-0">
              <SyncAnalyticsDashboard 
                syncHistory={syncHistory || []} 
                isLoading={loadingHistory}
              />
            </TabsContent>

            <TabsContent value="code" className="m-0">
              <CodeMetricsDashboard 
                repos={repos}
                syncHistory={syncHistory || []}
                isLoading={loadingHistory}
              />
            </TabsContent>

            <TabsContent value="activity" className="m-0">
              <SyncAnalyticsDashboard 
                syncHistory={syncHistory || []} 
                isLoading={loadingHistory}
              />
            </TabsContent>

            <TabsContent value="manage" className="m-0">
              <RepoManagement
                syncGroupId={syncGroupId}
                childRepos={childRepos || []}
                isLoading={!childRepos}
                onViewRepo={onViewRepo}
              />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
