import { Session } from "@supabase/supabase-js";
import { useState } from "react";
import DashboardHeader from "./DashboardHeader";
import GitHubAccountsList from "./GitHubAccountsList";
import RepositorySelector from "./RepositorySelector";
import FileDropZone from "./FileDropZone";
import SyncHistory from "./SyncHistory";

interface DashboardProps {
  session: Session;
}

const Dashboard = ({ session }: DashboardProps) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<any>(null);

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
