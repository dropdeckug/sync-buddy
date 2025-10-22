import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { File, Folder, ChevronRight, ChevronLeft, X, FileText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface RepositoryBrowserProps {
  accountId: string;
  repoId: string;
  repoName: string;
  repoFullName: string;
}

const RepositoryBrowser = ({ accountId, repoId, repoName, repoFullName }: RepositoryBrowserProps) => {
  const [currentPath, setCurrentPath] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

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

  const { data: fileContent, isLoading: loadingFile } = useQuery({
    queryKey: ["file-content", repoFullName, selectedFile],
    queryFn: async () => {
      if (!selectedFile) return null;
      
      const { data, error } = await supabase.functions.invoke("github-get-file", {
        body: { accountId, repoFullName, path: selectedFile },
      });

      if (error) throw error;
      return data;
    },
    enabled: !!selectedFile && !!repoFullName,
  });

  const navigateToFolder = (path: string) => {
    setCurrentPath(path);
  };

  const openFile = (path: string) => {
    setSelectedFile(path);
  };

  const goBack = () => {
    const pathParts = currentPath.split("/").filter(Boolean);
    pathParts.pop();
    setCurrentPath(pathParts.join("/"));
  };

  return (
    <>
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
                    onClick={() => item.type === "dir" ? navigateToFolder(item.path) : openFile(item.path)}
                    className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent`}
                  >
                    {item.type === "dir" ? (
                      <>
                        <Folder className="h-4 w-4" />
                        <span>{item.name}</span>
                        <ChevronRight className="h-4 w-4 ml-auto" />
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4" />
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

      <Dialog open={!!selectedFile} onOpenChange={() => setSelectedFile(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] bg-background">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {fileContent?.name || selectedFile}
              </DialogTitle>
              <Button variant="ghost" size="icon" onClick={() => setSelectedFile(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <ScrollArea className="h-[60vh]">
            {loadingFile ? (
              <div className="space-y-2">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : (
              <pre className="p-4 rounded-md bg-muted text-sm font-mono overflow-x-auto">
                {fileContent?.content || 'Unable to load file content'}
              </pre>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RepositoryBrowser;
