import { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Github, LogOut } from "lucide-react";
import { toast } from "sonner";

interface DashboardHeaderProps {
  session: Session;
}

const DashboardHeader = ({ session }: DashboardHeaderProps) => {
  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Signed out successfully");
    }
  };

  return (
    <header className="border-b border-border bg-card">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Github className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">GitHub Folder Sync</h1>
            <p className="text-sm text-muted-foreground">{session.user.email}</p>
          </div>
        </div>
        
        <Button 
          variant="outline" 
          onClick={handleSignOut}
          className="gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>
    </header>
  );
};

export default DashboardHeader;
