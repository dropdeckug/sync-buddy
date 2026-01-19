import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";

interface SpotifyLayoutProps {
  children: ReactNode;
  selectedAccountId: string | null;
}

export function SpotifyLayout({ children, selectedAccountId }: SpotifyLayoutProps) {
  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen flex w-full bg-gradient-to-b from-background to-background/95 gap-4 p-4 overflow-hidden">
        {/* Division 1: Sidebar - Your Library */}
        <AppSidebar selectedAccountId={selectedAccountId} />
        
        {/* Divisions 2 & 3: Main content area */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {children}
        </div>
      </div>
    </SidebarProvider>
  );
}
