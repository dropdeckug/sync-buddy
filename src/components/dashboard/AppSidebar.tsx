import { Folder, Plus, Search, Library, ArrowUpDown } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface AppSidebarProps {
  selectedAccountId: string | null;
}

export function AppSidebar({ selectedAccountId }: AppSidebarProps) {
  const { state } = useSidebar();

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

  return (
    <Sidebar className={state === "collapsed" ? "w-16" : "w-80"} collapsible="icon">
      <SidebarContent className="bg-sidebar-background border-r border-sidebar-border/30">
        {state !== "collapsed" && (
          <>
            <div className="p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Library className="w-5 h-5 text-sidebar-foreground/70" />
                  <h2 className="font-semibold text-base text-sidebar-foreground">Your Library</h2>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-8 h-8 rounded-full hover:bg-sidebar-accent transition-all"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <Tabs defaultValue="projects" className="w-full">
                <TabsList className="w-full grid grid-cols-2 bg-transparent gap-2 h-10">
                  <TabsTrigger 
                    value="projects"
                    className="bg-sidebar-accent/40 data-[state=active]:bg-sidebar-accent rounded-full text-xs font-medium transition-all"
                  >
                    Projects
                  </TabsTrigger>
                  <TabsTrigger 
                    value="recent"
                    className="bg-sidebar-accent/40 data-[state=active]:bg-sidebar-accent rounded-full text-xs font-medium transition-all"
                  >
                    Recent
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sidebar-foreground/50" />
                  <Input 
                    placeholder="Search in library" 
                    className="pl-9 bg-sidebar-accent/30 border-0 h-9 text-sm focus-visible:ring-1 focus-visible:ring-sidebar-ring rounded-md placeholder:text-sidebar-foreground/40"
                  />
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-9 h-9 rounded-md hover:bg-sidebar-accent transition-all flex-shrink-0"
                >
                  <ArrowUpDown className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <SidebarGroup className="px-2">
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {isLoading ? (
                    <div className="space-y-2 px-3 py-2">
                      <Skeleton className="h-20 w-full rounded-lg bg-sidebar-accent/30" />
                      <Skeleton className="h-20 w-full rounded-lg bg-sidebar-accent/30" />
                      <Skeleton className="h-20 w-full rounded-lg bg-sidebar-accent/30" />
                    </div>
                  ) : syncGroups && syncGroups.length > 0 ? (
                    syncGroups.map((group: any) => (
                      <SidebarMenuItem key={group.id}>
                        <SidebarMenuButton className="gap-3 p-3 h-auto hover:bg-sidebar-accent/50 rounded-lg transition-all group">
                          <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-sidebar-accent to-sidebar-accent/50 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:shadow-md transition-shadow">
                            <Folder className="w-7 h-7 text-sidebar-foreground/80" />
                          </div>
                          <div className="flex flex-col items-start min-w-0 flex-1 gap-1">
                            <span className="font-semibold text-sm truncate w-full text-sidebar-foreground">
                              {group.name}
                            </span>
                            <span className="text-xs text-sidebar-foreground/60 truncate w-full">
                              {group.mother_repo?.name || 'Sync Project'}
                            </span>
                          </div>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))
                  ) : (
                    <div className="p-6 text-center space-y-2">
                      <Folder className="w-12 h-12 mx-auto text-sidebar-foreground/30" />
                      <p className="text-sm text-sidebar-foreground/50 font-medium">No projects yet</p>
                      <p className="text-xs text-sidebar-foreground/40">Create your first sync group</p>
                    </div>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
