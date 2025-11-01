import { ChevronLeft, ChevronRight, Home, Search, ShoppingCart, Bell, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export function TopNavbar() {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Signed out successfully");
    }
  };

  return (
    <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-4 p-4">
        <SidebarTrigger className="lg:hidden" />
        
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="rounded-full bg-black/40 hover:bg-black/60">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full bg-black/40 hover:bg-black/60">
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        <Button variant="ghost" size="icon" className="rounded-full bg-black/40 hover:bg-black/60">
          <Home className="w-5 h-5" />
        </Button>

        <div className="flex-1 max-w-lg relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input 
            placeholder="What do you want to play?" 
            className="pl-12 pr-4 h-12 rounded-full bg-muted/50 border-0 hover:bg-muted focus:bg-muted"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" className="rounded-full px-6">
            Explore Premium
          </Button>
          
          <Button variant="ghost" size="icon" className="rounded-full">
            <Bell className="w-5 h-5" />
          </Button>

          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full bg-primary hover:bg-primary/90"
            onClick={handleSignOut}
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
