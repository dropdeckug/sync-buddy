import { useState } from "react";
import { Session } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SpotifyLayout } from "./SpotifyLayout";
import GitHubAccountsList from "./GitHubAccountsList";
import RepositorySelector from "./RepositorySelector";
import SyncGroupsList from "./SyncGroupsList";
import RecentActivity from "./RecentActivity";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DashboardProps {
  session: Session;
}

const Dashboard = ({ session }: DashboardProps) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  return (
    <SpotifyLayout selectedAccountId={selectedAccountId}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-8rem)]">
        {/* LEFT COLUMN - Recent Activity */}
        <div className="lg:col-span-1 h-full">
          <div className="h-full bg-card/70 backdrop-blur-sm border border-border/50 rounded-2xl shadow-card overflow-hidden flex flex-col">
            <div className="p-5 border-b border-border/30">
              <h2 className="text-lg font-bold">Recent Activity</h2>
              <p className="text-xs text-muted-foreground mt-1">Latest sync operations</p>
            </div>
            <div className="flex-1 overflow-hidden">
              {selectedAccountId ? (
                <RecentActivity accountId={selectedAccountId} />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">Select an account to view activity</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MIDDLE COLUMN - Main Content */}
        <div className="lg:col-span-1 h-full">
          <div className="h-full bg-card/70 backdrop-blur-sm border border-border/50 rounded-2xl shadow-card overflow-hidden flex flex-col">
            <div className="p-5 border-b border-border/30">
              <h2 className="text-lg font-bold">Repositories</h2>
              <p className="text-xs text-muted-foreground mt-1">Manage your GitHub repos</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {/* GitHub Accounts */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    GitHub Accounts
                  </h3>
                  <div className="bg-muted/20 rounded-xl border border-border/30 overflow-hidden">
                    <GitHubAccountsList 
                      userId={session.user.id}
                      selectedAccountId={selectedAccountId}
                      onSelectAccount={setSelectedAccountId}
                    />
                  </div>
                </div>

                {/* Repository Selection */}
                {selectedAccountId && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      Available Repositories
                    </h3>
                    <div className="bg-muted/20 rounded-xl border border-border/30 overflow-hidden">
                      <RepositorySelector
                        accountId={selectedAccountId}
                        onSelectRepo={() => {}}
                      />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* RIGHT COLUMN - Sync Projects */}
        <div className="lg:col-span-1 h-full">
          <div className="h-full bg-card/70 backdrop-blur-sm border border-border/50 rounded-2xl shadow-card overflow-hidden flex flex-col">
            <div className="p-5 border-b border-border/30">
              <h2 className="text-lg font-bold">Sync Projects</h2>
              <p className="text-xs text-muted-foreground mt-1">Your synchronization groups</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4">
                {selectedAccountId ? (
                  <SyncGroupsList
                    accountId={selectedAccountId}
                    onSelectGroup={setSelectedGroupId}
                    selectedGroupId={selectedGroupId}
                  />
                ) : (
                  <div className="flex items-center justify-center py-12">
                    <p className="text-sm text-muted-foreground">Select an account to view projects</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </SpotifyLayout>
  );
};

export default Dashboard;
