import { Folder, Heart, Plus, Search, Library, ArrowUpDown } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AppSidebar() {
  const { state } = useSidebar();

  return (
    <Sidebar className={state === "collapsed" ? "w-14" : "w-72"}>
      <SidebarContent className="bg-sidebar-background">
        {state !== "collapsed" && (
          <>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Library className="w-5 h-5 text-muted-foreground" />
                  <h2 className="font-semibold text-foreground">Your Library</h2>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" className="w-8 h-8">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <Tabs defaultValue="playlists" className="w-full">
                <TabsList className="w-full grid grid-cols-2 bg-transparent gap-2">
                  <TabsTrigger 
                    value="playlists"
                    className="bg-muted/50 data-[state=active]:bg-muted rounded-full"
                  >
                    Playlists
                  </TabsTrigger>
                  <TabsTrigger 
                    value="artists"
                    className="bg-muted/50 data-[state=active]:bg-muted rounded-full"
                  >
                    Artists
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex items-center gap-2 mt-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search" 
                    className="pl-9 bg-transparent border-0 h-8 text-sm"
                  />
                </div>
                <Button variant="ghost" size="icon" className="w-8 h-8">
                  <ArrowUpDown className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton className="gap-3 py-6 hover:bg-muted/50">
                      <div className="w-12 h-12 rounded bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center flex-shrink-0">
                        <Heart className="w-6 h-6 text-white fill-white" />
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="font-medium text-sm">Liked Songs</span>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span className="text-primary">📌</span>
                          <span>Playlist • 10 songs</span>
                        </div>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  <SidebarMenuItem>
                    <SidebarMenuButton className="gap-3 py-6 hover:bg-muted/50">
                      <div className="w-12 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <Folder className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="font-medium text-sm">Sync Groups</span>
                        <span className="text-xs text-muted-foreground">3 groups</span>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
