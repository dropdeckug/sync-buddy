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
      <div className="min-h-screen flex w-full bg-gradient-to-b from-background to-background/95">
        <AppSidebar selectedAccountId={selectedAccountId} />
        
        <div className="flex-1 flex flex-col min-w-0">
          <TopNavbar />
          
          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 ml-4">
            <div className="max-w-screen-2xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
