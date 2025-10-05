import { Session } from "@supabase/supabase-js";
import { useState } from "react";
import DashboardHeader from "./DashboardHeader";
import GitHubAccountsList from "./GitHubAccountsList";
import RepositorySelector from "./RepositorySelector";
import FileDropZone from "./FileDropZone";
import SyncHistory from "./SyncHistory";
import CreateSyncGroup from "./CreateSyncGroup";
import SyncGroupsList from "./SyncGroupsList";
import RepositoryBrowser from "./RepositoryBrowser";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface DashboardProps {
  session: Session;
}

const Dashboard = ({ session }: DashboardProps) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<any>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [browseRepoId, setBrowseRepoId] = useState<string | null>(null);

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
    <div className="min-h-screen bg-background">
      <DashboardHeader session={session} />
      
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* GitHub Accounts Section */}
        <section>
          <GitHubAccountsList 
            userId={session.user.id}
            selectedAccountId={selectedAccountId}
            onSelectAccount={setSelectedAccountId}
          />
        </section>

        {/* Repository Selection */}
        {selectedAccountId && (
          <section>
            <RepositorySelector
              accountId={selectedAccountId}
              onSelectRepo={setSelectedRepo}
            />
          </section>
        )}

        {/* File Drop Zone */}
        {selectedRepo && (
          <section>
            <FileDropZone
              repo={selectedRepo}
              accountId={selectedAccountId!}
            />
          </section>
        )}

        {/* Create Sync Group */}
        {selectedAccountId && repos && repos.length > 0 && (
          <section>
            <CreateSyncGroup accountId={selectedAccountId} repos={repos} />
          </section>
        )}

        {/* Sync Groups List */}
        {selectedAccountId && (
          <section>
            <SyncGroupsList
              accountId={selectedAccountId}
              onSelectGroup={setSelectedGroupId}
              selectedGroupId={selectedGroupId}
            />
          </section>
        )}

        {/* Repository Browser for Group Repos */}
        {selectedGroupId && groupRepos && groupRepos.length > 0 && (
          <section>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groupRepos.map((repo: any) => (
                <RepositoryBrowser
                  key={repo.id}
                  accountId={selectedAccountId!}
                  repoId={repo.id}
                  repoName={repo.full_name}
                />
              ))}
            </div>
          </section>
        )}

        {/* Sync History */}
        {selectedAccountId && (
          <section>
            <SyncHistory accountId={selectedAccountId} />
          </section>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
