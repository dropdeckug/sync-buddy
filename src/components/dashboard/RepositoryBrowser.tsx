import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { File, Folder, ChevronRight, ChevronLeft, FileText, Edit } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileEditor } from "@/components/editor/FileEditor";

interface RepositoryBrowserProps {
  accountId: string;
  repoId: string;
  repoName: string;
  repoFullName: string;
}

const RepositoryBrowser = ({ accountId, repoId, repoName, repoFullName }: RepositoryBrowserProps) => {
  const [currentPath, setCurrentPath] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

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

  const handleEditFile = () => {
    if (selectedFile && fileContent) {
      setEditorOpen(true);
    }
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
                    className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent ${selectedFile === item.path ? 'bg-accent' : ''}`}
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

      {/* File Preview Panel */}
      {selectedFile && (
        <Card className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {fileContent?.name || selectedFile.split('/').pop()}
              </CardTitle>
              <CardDescription className="text-xs font-mono">{selectedFile}</CardDescription>
            </div>
            <Button size="sm" onClick={handleEditFile} disabled={loadingFile || !fileContent}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="h-60">
              {loadingFile ? (
                <div className="space-y-2">
                  {[...Array(10)].map((_, i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                  ))}
                </div>
              ) : (
                <pre className="p-4 rounded-md bg-muted text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {fileContent?.content || 'Unable to load file content'}
                </pre>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* File Editor Modal */}
      {fileContent && (
        <FileEditor
          isOpen={editorOpen}
          onClose={() => setEditorOpen(false)}
          accountId={accountId}
          repoFullName={repoFullName}
          filePath={selectedFile || ''}
          fileName={fileContent.name}
          initialContent={fileContent.content}
          fileSha={fileContent.sha}
        />
      )}
    </>
  );
};

export default RepositoryBrowser;
