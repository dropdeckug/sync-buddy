import { useState } from "react";
import { Session } from "@supabase/supabase-js";
import { SpotifyLayout } from "./SpotifyLayout";
import GitHubAccountsList from "./GitHubAccountsList";
import RepositorySelector from "./RepositorySelector";
import SyncGroupsList from "./SyncGroupsList";
import RecentActivity from "./RecentActivity";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LogOut, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface DashboardProps {
  session: Session;
}

const Dashboard = ({ session }: DashboardProps) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Signed out successfully");
    }
  };

  return (
    <SpotifyLayout selectedAccountId={selectedAccountId}>
      <div className="grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-4 h-[calc(100vh-2rem)]">
        {/* DIVISION 2: Middle - Main Content */}
        <div className="h-full">
          <div className="h-full bg-card/70 backdrop-blur-sm border border-border/50 rounded-2xl shadow-card overflow-hidden flex flex-col">
            <div className="p-5 border-b border-border/30 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Repositories & Projects</h2>
                <p className="text-xs text-muted-foreground mt-1">Manage your GitHub repositories</p>
              </div>
              <Button 
                variant="ghost"
                size="icon" 
                className="rounded-full hover:bg-muted/50 transition-all w-9 h-9"
                onClick={handleSignOut}
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                {/* GitHub Accounts Section */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2 px-1">
                    <span className="w-1 h-4 bg-primary rounded-full"></span>
                    GitHub Accounts
                  </h3>
                  <div className="bg-muted/20 rounded-xl border border-border/30 overflow-hidden hover:border-border/50 transition-all relative z-10">
                    <GitHubAccountsList 
                      userId={session.user.id}
                      selectedAccountId={selectedAccountId}
                      onSelectAccount={setSelectedAccountId}
                    />
                  </div>
                </div>

                {/* Repository Selection */}
                {selectedAccountId && (
                  <div className="space-y-3 animate-fade-in">
                    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2 px-1">
                      <span className="w-1 h-4 bg-accent rounded-full"></span>
                      Available Repositories
                    </h3>
                    <div className="bg-muted/20 rounded-xl border border-border/30 overflow-hidden hover:border-border/50 transition-all relative z-10">
                      <RepositorySelector
                        accountId={selectedAccountId}
                        onSelectRepo={() => {}}
                      />
                    </div>
                  </div>
                )}

                {/* Sync Projects */}
                {selectedAccountId && (
                  <div className="space-y-3 animate-fade-in">
                    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2 px-1">
                      <span className="w-1 h-4 bg-primary rounded-full"></span>
                      Sync Projects
                    </h3>
                    <div className="bg-muted/20 rounded-xl border border-border/30 overflow-hidden hover:border-border/50 transition-all relative z-10">
                      <SyncGroupsList
                        accountId={selectedAccountId}
                        onSelectGroup={setSelectedGroupId}
                        selectedGroupId={selectedGroupId}
                      />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* DIVISION 3: Right - Recent Activity & Sync History (Collapsible) */}
        <div className="h-full relative">
          <Collapsible defaultOpen={true}>
            <div className="h-full bg-card/70 backdrop-blur-sm border border-border/50 rounded-2xl shadow-card overflow-hidden flex flex-col">
              <div className="p-5 border-b border-border/30 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">Recent Activity</h2>
                  <p className="text-xs text-muted-foreground mt-1">Latest synchronization history</p>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="flex-1 overflow-hidden">
                {selectedAccountId ? (
                  <RecentActivity accountId={selectedAccountId} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                    <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mb-4">
                      <span className="text-4xl">📊</span>
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1">No Activity Yet</p>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      Select a GitHub account to view your recent sync history and activity
                    </p>
                  </div>
                )}
              </CollapsibleContent>
            </div>
          </Collapsible>
        </div>
      </div>
    </SpotifyLayout>
  );
};

export default Dashboard;
