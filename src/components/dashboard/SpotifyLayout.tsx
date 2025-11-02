import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { TopNavbar } from "./TopNavbar";

interface SpotifyLayoutProps {
  children: ReactNode;
  selectedAccountId: string | null;
}

export function SpotifyLayout({ children, selectedAccountId }: SpotifyLayoutProps) {
  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar selectedAccountId={selectedAccountId} />
        
        <div className="flex-1 flex flex-col">
          <TopNavbar />
          
          <main className="flex-1 overflow-auto p-8">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
