import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { TopNavbar } from "./TopNavbar";
import { PlayerBar } from "./PlayerBar";

interface SpotifyLayoutProps {
  children: ReactNode;
}

export function SpotifyLayout({ children }: SpotifyLayoutProps) {
  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          <TopNavbar />
          
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
          
          <PlayerBar />
        </div>
      </div>
    </SidebarProvider>
  );
}
