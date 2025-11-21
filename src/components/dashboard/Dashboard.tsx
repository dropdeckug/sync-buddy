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
      <div className="space-y-6">
        {/* Filter Tabs */}
        <div className="flex items-center gap-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-transparent gap-2 h-12">
              <TabsTrigger 
                value="all"
                className="bg-muted/40 data-[state=active]:bg-white data-[state=active]:text-background rounded-full px-6 font-medium transition-all hover:bg-muted/60"
              >
                All
              </TabsTrigger>
              <TabsTrigger 
                value="repos"
                className="bg-muted/40 data-[state=active]:bg-white data-[state=active]:text-background rounded-full px-6 font-medium transition-all hover:bg-muted/60"
              >
                Repositories
              </TabsTrigger>
              <TabsTrigger 
                value="groups"
                className="bg-muted/40 data-[state=active]:bg-white data-[state=active]:text-background rounded-full px-6 font-medium transition-all hover:bg-muted/60"
              >
                Sync Projects
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* ALL TAB - Shows everything */}
        {activeTab === "all" && (
          <>
            {/* GitHub Accounts */}
            <section className="space-y-4">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">GitHub Accounts</h2>
              <Card className="bg-card/70 backdrop-blur-sm border-border/50 shadow-card overflow-hidden transition-all hover:bg-card/80">
                <GitHubAccountsList 
                  userId={session.user.id}
                  selectedAccountId={selectedAccountId}
                  onSelectAccount={setSelectedAccountId}
                />
              </Card>
            </section>

            {/* Sync Groups Overview */}
            {selectedAccountId && (
              <section className="space-y-4">
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Sync Projects</h2>
                <Card className="bg-card/70 backdrop-blur-sm border-border/50 shadow-card overflow-hidden transition-all hover:bg-card/80">
                  <SyncGroupsList
                    accountId={selectedAccountId}
                    onSelectGroup={setSelectedGroupId}
                    selectedGroupId={selectedGroupId}
                  />
                </Card>
              </section>
            )}

            {/* Recent Activity */}
            {selectedAccountId && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Recent Activity</h2>
                  <Button variant="ghost" className="text-sm text-muted-foreground hover:text-foreground rounded-full">
                    Show all
                  </Button>
                </div>
                <Card className="bg-card/70 backdrop-blur-sm border-border/50 shadow-card overflow-hidden">
                  <SyncHistory accountId={selectedAccountId} />
                </Card>
              </section>
            )}
          </>
        )}

        {/* REPOSITORIES TAB - Only repository management */}
        {activeTab === "repos" && (
          <>
            {/* GitHub Accounts Section */}
            <section className="space-y-4">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">GitHub Accounts</h2>
              <Card className="bg-card/70 backdrop-blur-sm border-border/50 shadow-card overflow-hidden transition-all hover:bg-card/80">
                <GitHubAccountsList 
                  userId={session.user.id}
                  selectedAccountId={selectedAccountId}
                  onSelectAccount={setSelectedAccountId}
                />
              </Card>
            </section>

            {/* Repository Selection */}
            {selectedAccountId && !selectedRepo && (
              <section className="space-y-4">
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Select Repository</h2>
                <Card className="bg-card/70 backdrop-blur-sm border-border/50 shadow-card overflow-hidden transition-all hover:bg-card/80">
                  <RepositorySelector
                    accountId={selectedAccountId}
                    onSelectRepo={setSelectedRepo}
                  />
                </Card>
              </section>
            )}

            {/* File Drop Zone */}
            {selectedRepo && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Upload Files</h2>
                  <Button 
                    variant="outline" 
                    onClick={() => setSelectedRepo(null)}
                    className="rounded-full border-border/50 hover:bg-muted/50"
                  >
                    Back
                  </Button>
                </div>
                <Card className="bg-card/70 backdrop-blur-sm border-border/50 shadow-card overflow-hidden">
                  <FileDropZone
                    accountId={selectedAccountId!}
                    repo={selectedRepo}
                  />
                </Card>
              </section>
            )}
          </>
        )}

        {/* SYNC PROJECTS TAB - Only sync groups */}
        {activeTab === "groups" && (
          <>
            {!selectedAccountId ? (
              <section className="space-y-4">
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Select GitHub Account</h2>
                <Card className="bg-card/70 backdrop-blur-sm border-border/50 shadow-card overflow-hidden transition-all hover:bg-card/80">
                  <GitHubAccountsList 
                    userId={session.user.id}
                    selectedAccountId={selectedAccountId}
                    onSelectAccount={setSelectedAccountId}
                  />
                </Card>
              </section>
            ) : (
              <>
                {/* Sync Groups List */}
                <section className="space-y-4">
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Your Sync Projects</h2>
                  <Card className="bg-card/70 backdrop-blur-sm border-border/50 shadow-card overflow-hidden transition-all hover:bg-card/80">
                    <SyncGroupsList
                      accountId={selectedAccountId}
                      onSelectGroup={setSelectedGroupId}
                      selectedGroupId={selectedGroupId}
                    />
                  </Card>
                </section>

                {/* Repository Browser for Group Repos */}
                {selectedGroupId && groupRepos && groupRepos.length > 0 && (
                  <section className="space-y-4">
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Browse Repositories</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {groupRepos.map((repo: any) => (
                        <Card key={repo.id} className="bg-card/70 backdrop-blur-sm border-border/50 shadow-card overflow-hidden transition-all hover:bg-card/80">
                          <RepositoryBrowser
                            accountId={selectedAccountId}
                            repoId={repo.id}
                            repoName={repo.name}
                            repoFullName={repo.full_name}
                          />
                        </Card>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>
    </SpotifyLayout>
  );
};

export default Dashboard;
