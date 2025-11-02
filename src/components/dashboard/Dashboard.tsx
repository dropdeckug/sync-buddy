import { useState } from "react";
import { Session } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SpotifyLayout } from "./SpotifyLayout";
import GitHubAccountsList from "./GitHubAccountsList";
import RepositorySelector from "./RepositorySelector";
import FileDropZone from "./FileDropZone";
import CreateSyncGroup from "./CreateSyncGroup";
import SyncGroupsList from "./SyncGroupsList";
import RepositoryBrowser from "./RepositoryBrowser";
import SyncHistory from "./SyncHistory";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface DashboardProps {
  session: Session;
}

const Dashboard = ({ session }: DashboardProps) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<any>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [browseRepoId, setBrowseRepoId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");

  const { data: repos } = useQuery({
    queryKey: ["github-repos", selectedAccountId],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("github-repos", {
        body: { accountId: selectedAccountId },
      });
      return data?.repos || [];
    },
    enabled: !!selectedAccountId,
  });

  const { data: groupRepos } = useQuery({
    queryKey: ["sync-group-repos", selectedGroupId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_group_repos")
        .select("repo:repos(*)")
        .eq("sync_group_id", selectedGroupId);
      return data?.map(item => item.repo) || [];
    },
    enabled: !!selectedGroupId,
  });

  return (
    <SpotifyLayout selectedAccountId={selectedAccountId}>
      <div className="space-y-8">
        {/* Filter Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-transparent gap-2">
            <TabsTrigger 
              value="all"
              className="bg-muted/50 data-[state=active]:bg-muted rounded-full px-4"
            >
              All
            </TabsTrigger>
            <TabsTrigger 
              value="repos"
              className="bg-muted/50 data-[state=active]:bg-muted rounded-full px-4"
            >
              Repositories
            </TabsTrigger>
            <TabsTrigger 
              value="groups"
              className="bg-muted/50 data-[state=active]:bg-muted rounded-full px-4"
            >
              Sync Groups
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* GitHub Accounts Section */}
        {(activeTab === "all" || activeTab === "repos") && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">GitHub Accounts</h2>
            </div>
            <Card className="bg-card/50 backdrop-blur border-border">
              <GitHubAccountsList 
                userId={session.user.id}
                selectedAccountId={selectedAccountId}
                onSelectAccount={setSelectedAccountId}
              />
            </Card>
          </section>
        )}

        {/* Repository Selection */}
        {(activeTab === "all" || activeTab === "repos") && selectedAccountId && !selectedRepo && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Select Repository</h2>
            </div>
            <Card className="bg-card/50 backdrop-blur border-border">
              <RepositorySelector
                accountId={selectedAccountId}
                onSelectRepo={setSelectedRepo}
              />
            </Card>
          </section>
        )}

        {/* File Drop Zone */}
        {(activeTab === "all" || activeTab === "repos") && selectedRepo && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Upload Files</h2>
              <Button variant="outline" onClick={() => setSelectedRepo(null)}>
                Back
              </Button>
            </div>
            <Card className="bg-card/50 backdrop-blur border-border">
              <FileDropZone
                accountId={selectedAccountId!}
                repo={selectedRepo}
              />
            </Card>
          </section>
        )}

        {/* Sync Groups Management */}
        {(activeTab === "all" || activeTab === "groups") && selectedAccountId && repos && repos.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Sync Groups</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-card/50 backdrop-blur border-border">
                <CreateSyncGroup accountId={selectedAccountId} repos={repos} />
              </Card>
              <Card className="bg-card/50 backdrop-blur border-border">
                <SyncGroupsList
                  accountId={selectedAccountId}
                  onSelectGroup={setSelectedGroupId}
                  selectedGroupId={selectedGroupId}
                />
              </Card>
            </div>
          </section>
        )}

        {/* Repository Browser for Group Repos */}
        {(activeTab === "all" || activeTab === "groups") && selectedGroupId && groupRepos && groupRepos.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Browse Repositories</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groupRepos.map((repo: any) => (
                <Card key={repo.id} className="bg-card/50 backdrop-blur border-border">
                  <RepositoryBrowser
                    accountId={selectedAccountId!}
                    repoId={repo.id}
                    repoName={repo.name}
                    repoFullName={repo.full_name}
                  />
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Sync History */}
        {activeTab === "all" && selectedAccountId && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Recent Activity</h2>
              <Button variant="ghost" className="text-sm">Show all</Button>
            </div>
            <Card className="bg-card/50 backdrop-blur border-border">
              <SyncHistory accountId={selectedAccountId} />
            </Card>
          </section>
        )}
      </div>
    </SpotifyLayout>
  );
};

export default Dashboard;
