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
    <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border/30">
      <div className="flex items-center gap-3 px-4 md:px-6 py-3">
        <SidebarTrigger className="hover:bg-muted/50 rounded-md transition-colors" />
        
        <div className="hidden md:flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full bg-black/30 hover:bg-black/50 transition-all w-9 h-9 backdrop-blur-sm"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full bg-black/30 hover:bg-black/50 transition-all w-9 h-9 backdrop-blur-sm"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        <Button 
          variant="ghost" 
          size="icon" 
          className="rounded-full bg-black/30 hover:bg-black/50 transition-all w-9 h-9 backdrop-blur-sm hidden md:flex"
          onClick={() => navigate("/")}
        >
          <Home className="w-5 h-5" />
        </Button>

        <div className="flex-1 max-w-md relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
          <Input 
            placeholder="Search repositories, projects..." 
            className="pl-11 pr-4 h-11 rounded-full bg-card/50 border-border/50 hover:bg-card/70 focus-visible:bg-card focus-visible:ring-1 focus-visible:ring-ring transition-all placeholder:text-muted-foreground/60"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full hover:bg-muted/50 transition-all w-9 h-9 hidden md:flex"
          >
            <Bell className="w-5 h-5" />
          </Button>

          <Button 
            variant="default"
            size="icon" 
            className="rounded-full bg-primary hover:bg-primary/90 transition-all w-9 h-9 shadow-glow"
            onClick={handleSignOut}
            title="Sign Out"
          >
            <LogOut className="w-4 h-4 text-primary-foreground" />
          </Button>
        </div>
      </div>
    </header>
  );
}
