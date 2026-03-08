import { useState } from "react";
import { Session } from "@supabase/supabase-js";
import GitHubAccountsList from "./GitHubAccountsList";
import SyncGroupsList from "./SyncGroupsList";
import RecentActivity from "./RecentActivity";
import NetlifyDrop from "./NetlifyDrop";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LogOut, Rocket, Folder, Activity, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";

interface DashboardProps {
  session: Session;
}

const Dashboard = ({ session }: DashboardProps) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"overview" | "deploy" | "activity">("deploy");
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error(error.message);
    else toast.success("Signed out");
  };

  // Mobile: tab-based layout
  if (isMobile) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {/* Mobile Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/30">
          <h1 className="text-lg font-bold tracking-tight">GitSync</h1>
          <Button variant="ghost" size="icon" onClick={handleSignOut} className="rounded-full w-8 h-8">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-border/30">
          {[
            { id: "overview" as const, icon: Folder, label: "Overview" },
            { id: "deploy" as const, icon: Rocket, label: "Deploy" },
            { id: "activity" as const, icon: Activity, label: "Activity" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-colors ${
                mobileTab === tab.id
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto">
          {mobileTab === "overview" && (
            <div className="space-y-4 p-4">
              <GitHubAccountsList
                userId={session.user.id}
                selectedAccountId={selectedAccountId}
                onSelectAccount={setSelectedAccountId}
              />
              {selectedAccountId && (
                <SyncGroupsList
                  accountId={selectedAccountId}
                  onSelectGroup={(gId) => navigate(`/project/${gId}`)}
                  selectedGroupId={selectedGroupId}
                />
              )}
            </div>
          )}
          {mobileTab === "deploy" && selectedAccountId && (
            <NetlifyDrop accountId={selectedAccountId} />
          )}
          {mobileTab === "deploy" && !selectedAccountId && (
            <div className="flex flex-col items-center justify-center h-64 gap-3 p-6 text-center">
              <Rocket className="w-12 h-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Connect a GitHub account first to deploy</p>
              <Button variant="outline" size="sm" onClick={() => setMobileTab("overview")}>
                Go to Overview
              </Button>
            </div>
          )}
          {mobileTab === "activity" && selectedAccountId && (
            <RecentActivity accountId={selectedAccountId} />
          )}
          {mobileTab === "activity" && !selectedAccountId && (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <Activity className="w-12 h-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Select an account to view activity</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Desktop: 3-column layout
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Rocket className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">GitSync</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:block">{session.user.email}</span>
          <Button variant="ghost" size="icon" onClick={handleSignOut} className="rounded-full w-8 h-8">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 3-column grid */}
      <div className="flex-1 grid grid-cols-[320px_1fr_320px] gap-3 p-3 overflow-hidden">
        {/* LEFT: Overview */}
        <div className="bg-card/70 backdrop-blur-sm border border-border/50 rounded-2xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border/30">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Folder className="w-4 h-4" />
              Overview
            </h2>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-1">
              {/* GitHub Accounts */}
              <GitHubAccountsList
                userId={session.user.id}
                selectedAccountId={selectedAccountId}
                onSelectAccount={setSelectedAccountId}
              />

              {/* Sync Projects */}
              {selectedAccountId && (
                <div className="border-t border-border/30">
                  <div className="px-4 pt-3 pb-1">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <span className="w-1 h-3 bg-primary rounded-full" />
                      Sync Projects
                    </h3>
                  </div>
                  <SyncGroupsList
                    accountId={selectedAccountId}
                    onSelectGroup={(gId) => navigate(`/project/${gId}`)}
                    selectedGroupId={selectedGroupId}
                  />
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* CENTER: Deploy Drop Zone */}
        <div className="bg-card/70 backdrop-blur-sm border border-border/50 rounded-2xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border/30 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Rocket className="w-4 h-4" />
              Deploy to GitHub
            </h2>
            {!selectedAccountId && (
              <span className="text-xs text-muted-foreground">← Select an account first</span>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            {selectedAccountId ? (
              <NetlifyDrop accountId={selectedAccountId} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
                <div className="w-24 h-24 rounded-3xl bg-muted/20 flex items-center justify-center">
                  <Rocket className="w-12 h-12 text-muted-foreground/30" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Ready to deploy?</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Connect a GitHub account from the left panel, then drag & drop your files here to create a new repository instantly.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                  <ChevronRight className="w-3 h-3" />
                  Supports folders, individual files, and zip archives
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Activity */}
        <div className="bg-card/70 backdrop-blur-sm border border-border/50 rounded-2xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border/30">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Recent Activity
            </h2>
          </div>
          <div className="flex-1 overflow-hidden">
            {selectedAccountId ? (
              <RecentActivity accountId={selectedAccountId} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                <div className="w-16 h-16 rounded-full bg-muted/20 flex items-center justify-center mb-4">
                  <Activity className="w-8 h-8 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-medium mb-1">No Activity Yet</p>
                <p className="text-xs text-muted-foreground">
                  Select a GitHub account to view sync history
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
