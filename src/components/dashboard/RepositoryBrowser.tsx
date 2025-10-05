import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { File, Folder, ChevronRight, ChevronLeft } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RepositoryBrowserProps {
  accountId: string;
  repoId: string;
  repoName: string;
}

const RepositoryBrowser = ({ accountId, repoId, repoName }: RepositoryBrowserProps) => {
  const [currentPath, setCurrentPath] = useState("");

  const { data: contents, isLoading } = useQuery({
    queryKey: ["repo-contents", repoId, currentPath],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("github-browse", {
        body: { accountId, repoId, path: currentPath },
      });

      if (error) throw error;
      return data.contents;
    },
    enabled: !!repoId,
  });

  const navigateToFolder = (path: string) => {
    setCurrentPath(path);
  };

  const goBack = () => {
    const pathParts = currentPath.split("/").filter(Boolean);
    pathParts.pop();
    setCurrentPath(pathParts.join("/"));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Folder className="h-5 w-5" />
          {repoName}
        </CardTitle>
        <CardDescription>
          {currentPath || "Root"} 
          {currentPath && (
            <Button variant="ghost" size="sm" onClick={goBack} className="ml-2">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {contents?.map((item: any) => (
                <div
                  key={item.path}
                  onClick={() => item.type === "dir" && navigateToFolder(item.path)}
                  className={`flex items-center gap-2 p-2 rounded-md ${
                    item.type === "dir"
                      ? "cursor-pointer hover:bg-accent"
                      : "text-muted-foreground"
                  }`}
                >
                  {item.type === "dir" ? (
                    <>
                      <Folder className="h-4 w-4" />
                      <span>{item.name}</span>
                      <ChevronRight className="h-4 w-4 ml-auto" />
                    </>
                  ) : (
                    <>
                      <File className="h-4 w-4" />
                      <span>{item.name}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default RepositoryBrowser;
