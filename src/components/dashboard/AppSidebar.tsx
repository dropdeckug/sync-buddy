import { Folder, Plus, Search, Library, ArrowUpDown, GitBranch } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CreateSyncGroup from "./CreateSyncGroup";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface AppSidebarProps {
  selectedAccountId: string | null;
}

export function AppSidebar({ selectedAccountId }: AppSidebarProps) {
  const { state } = useSidebar();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const { data: syncGroups, isLoading } = useQuery({
    queryKey: ["sync-groups", selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const { data } = await supabase
        .from("sync_groups")
        .select("*, mother_repo:repos!sync_groups_mother_repo_id_fkey(*)")
        .eq("account_id", selectedAccountId);
      return data || [];
    },
    enabled: !!selectedAccountId,
  });

  const { data: repos } = useQuery({
    queryKey: ["github-repos", selectedAccountId],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("github-repos", {
        body: { accountId: selectedAccountId },
      });
      return data?.repos || [];
    },
    enabled: !!selectedAccountId && showCreateModal,
  });

  const filteredGroups = syncGroups?.filter((group: any) =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Sidebar className={state === "collapsed" ? "w-16" : "w-80"} collapsible="icon">
      <SidebarContent className="bg-card/70 backdrop-blur-sm border-r border-border/50 rounded-2xl m-4 shadow-card">
        {state !== "collapsed" && (
          <>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Library className="w-5 h-5 text-primary" />
                <h2 className="font-bold text-lg">Your Library</h2>
              </div>
              
              <Button 
                onClick={() => setShowCreateModal(true)}
                className="w-full bg-primary hover:bg-primary-glow text-primary-foreground font-semibold rounded-xl h-11 transition-all shadow-md hover:shadow-glow flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Create Sync Project
              </Button>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search projects" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 bg-muted/30 border border-border/30 h-10 text-sm focus-visible:ring-2 focus-visible:ring-primary rounded-lg placeholder:text-muted-foreground"
                  />
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-10 h-10 rounded-lg hover:bg-muted/50 transition-all flex-shrink-0"
                >
                  <ArrowUpDown className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <SidebarGroup className="px-3 flex-1">
              <SidebarGroupContent>
                <SidebarMenu className="gap-2">
                  {isLoading ? (
                    <div className="space-y-2 px-2">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-20 w-full rounded-xl bg-muted/30" />
                      ))}
                    </div>
                  ) : filteredGroups && filteredGroups.length > 0 ? (
                    filteredGroups.map((group: any) => (
                      <SidebarMenuItem key={group.id}>
                        <SidebarMenuButton 
                          className="gap-3 p-4 h-auto hover:bg-muted/50 rounded-xl transition-all group cursor-pointer border border-border/30 hover:border-primary/50"
                          onClick={() => navigate(`/project/${group.id}`)}
                        >
                          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:shadow-md transition-shadow border border-primary/20">
                            <Folder className="w-6 h-6 text-primary" />
                          </div>
                          <div className="flex flex-col items-start min-w-0 flex-1 gap-1">
                            <span className="font-semibold text-sm truncate w-full">
                              {group.name}
                            </span>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <GitBranch className="w-3 h-3" />
                              <span className="truncate">{group.mother_repo?.name || 'Sync Project'}</span>
                            </div>
                          </div>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))
                  ) : (
                    <div className="p-8 text-center space-y-3">
                      <Folder className="w-16 h-16 mx-auto text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground font-medium">No projects yet</p>
                      <p className="text-xs text-muted-foreground">Create your first sync project</p>
                    </div>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl bg-background/95 backdrop-blur-xl border-border/50">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Create Sync Project</DialogTitle>
          </DialogHeader>
          {repos && repos.length > 0 && (
            <CreateSyncGroup 
              accountId={selectedAccountId!} 
              repos={repos}
              onSuccess={() => setShowCreateModal(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
