import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  File, Folder, ChevronRight, ChevronLeft, FileText,
  Edit, FolderOpen, Code, Home, Copy
} from "lucide-react";
import { FileEditor } from "@/components/editor/FileEditor";
import { toast } from "sonner";

interface RepositoryBrowserProps {
  accountId: string;
  repoId: string;
  repoName: string;
  repoFullName: string;
  syncGroupId?: string;
}

const RepositoryBrowser = ({ accountId, repoId, repoName, repoFullName, syncGroupId }: RepositoryBrowserProps) => {
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
    setSelectedFile(null);
  };

  const openFile = (path: string) => {
    setSelectedFile(path);
  };

  const goBack = () => {
    const pathParts = currentPath.split("/").filter(Boolean);
    pathParts.pop();
    setCurrentPath(pathParts.join("/"));
    setSelectedFile(null);
  };

  const handleEditFile = () => {
    if (selectedFile && fileContent) setEditorOpen(true);
  };

  const breadcrumbs = currentPath ? currentPath.split("/").filter(Boolean) : [];

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['ts', 'tsx', 'js', 'jsx', 'py', 'rb', 'go', 'rs'].includes(ext || '')) return Code;
    return FileText;
  };

  return (
    <>
      <div className="space-y-4">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => { setCurrentPath(""); setSelectedFile(null); }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/30"
          >
            <Home className="w-3 h-3" />
            <span>{repoName}</span>
          </button>
          {breadcrumbs.map((part, i) => {
            const fullPath = breadcrumbs.slice(0, i + 1).join("/");
            return (
              <div key={i} className="flex items-center gap-1">
                <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
                <button
                  onClick={() => navigateToFolder(fullPath)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/30"
                >
                  {part}
                </button>
              </div>
            );
          })}
          {currentPath && (
            <Button variant="ghost" size="sm" onClick={goBack} className="h-6 px-2 text-[10px] rounded-md ml-auto gap-1">
              <ChevronLeft className="h-3 w-3" /> Back
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[400px]">
          {/* File Tree */}
          <div className="rounded-xl border border-border/30 bg-muted/10 overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-border/20 flex items-center gap-2">
              <FolderOpen className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium">{currentPath || "Root"}</span>
              {contents && (
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">{contents.length} items</Badge>
              )}
            </div>
            <ScrollArea className="flex-1">
              {isLoading ? (
                <div className="p-3 space-y-1.5">
                  {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}
                </div>
              ) : (
                <div className="p-1.5">
                  {/* Directories first, then files */}
                  {contents
                    ?.sort((a: any, b: any) => {
                      if (a.type === 'dir' && b.type !== 'dir') return -1;
                      if (a.type !== 'dir' && b.type === 'dir') return 1;
                      return a.name.localeCompare(b.name);
                    })
                    .map((item: any) => {
                      const FileIcon = item.type === "dir" ? Folder : getFileIcon(item.name);
                      const isSelected = selectedFile === item.path;

                      return (
                        <button
                          key={item.path}
                          onClick={() => item.type === "dir" ? navigateToFolder(item.path) : openFile(item.path)}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all group ${
                            isSelected
                              ? "bg-primary/10 border border-primary/20"
                              : "hover:bg-muted/30 border border-transparent"
                          }`}
                        >
                          <FileIcon className={`h-3.5 w-3.5 shrink-0 ${
                            item.type === "dir" ? "text-primary" : isSelected ? "text-primary" : "text-muted-foreground"
                          }`} />
                          <span className={`text-sm truncate flex-1 ${isSelected ? "font-medium" : ""}`}>
                            {item.name}
                          </span>
                          {item.type === "dir" && (
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </button>
                      );
                    })}
                  {contents?.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Folder className="w-8 h-8 text-muted-foreground/20 mb-2" />
                      <p className="text-xs text-muted-foreground">Empty directory</p>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* File Preview */}
          <div className="rounded-xl border border-border/30 bg-muted/10 overflow-hidden flex flex-col">
            {selectedFile ? (
              <>
                <div className="px-3 py-2 border-b border-border/20 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-xs font-medium truncate">{fileContent?.name || selectedFile.split('/').pop()}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] rounded-md gap-1"
                      onClick={() => {
                        if (fileContent?.content) {
                          navigator.clipboard.writeText(fileContent.content);
                          toast.success("Copied to clipboard");
                        }
                      }}
                      disabled={loadingFile || !fileContent}
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </Button>
                    <Button
                      size="sm"
                      className="h-6 px-2 text-[10px] rounded-md gap-1"
                      onClick={handleEditFile}
                      disabled={loadingFile || !fileContent}
                    >
                      <Edit className="h-3 w-3" /> Edit
                    </Button>
                  </div>
                </div>
                <div className="px-3 py-1 border-b border-border/10">
                  <p className="text-[10px] text-muted-foreground font-mono truncate">{selectedFile}</p>
                </div>
                <ScrollArea className="flex-1">
                  {loadingFile ? (
                    <div className="p-3 space-y-1.5">
                      {[...Array(15)].map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
                    </div>
                  ) : (
                    <pre className="p-3 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap text-foreground/90">
                      {fileContent?.content || 'Unable to load file content'}
                    </pre>
                  )}
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-muted/20 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-muted-foreground/20" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground">No file selected</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">Click a file to preview its contents</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

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
          syncGroupId={syncGroupId}
        />
      )}
    </>
  );
};

export default RepositoryBrowser;
