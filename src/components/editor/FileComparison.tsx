import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { GitCompare, ArrowRight, FileCode, RefreshCw } from "lucide-react";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";

interface FileComparisonProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  repos: { id: string; name: string; fullName: string }[];
}

interface FileTreeItem {
  path: string;
  type: string;
  name: string;
}

export function FileComparison({ isOpen, onClose, accountId, repos }: FileComparisonProps) {
  const [leftRepo, setLeftRepo] = useState<string>("");
  const [rightRepo, setRightRepo] = useState<string>("");
  const [leftFile, setLeftFile] = useState<string>("");
  const [rightFile, setRightFile] = useState<string>("");

  // Fetch file tree for left repo
  const { data: leftFiles, isLoading: loadingLeftFiles } = useQuery({
    queryKey: ["repo-files", leftRepo],
    queryFn: async () => {
      const repo = repos.find(r => r.id === leftRepo);
      if (!repo) return [];
      
      const { data, error } = await supabase.functions.invoke("github-browse", {
        body: { accountId, repoId: leftRepo, path: "", recursive: true },
      });
      if (error) throw error;
      return (data.contents || []).filter((f: FileTreeItem) => f.type === "file");
    },
    enabled: !!leftRepo,
  });

  // Fetch file tree for right repo
  const { data: rightFiles, isLoading: loadingRightFiles } = useQuery({
    queryKey: ["repo-files", rightRepo],
    queryFn: async () => {
      const repo = repos.find(r => r.id === rightRepo);
      if (!repo) return [];
      
      const { data, error } = await supabase.functions.invoke("github-browse", {
        body: { accountId, repoId: rightRepo, path: "", recursive: true },
      });
      if (error) throw error;
      return (data.contents || []).filter((f: FileTreeItem) => f.type === "file");
    },
    enabled: !!rightRepo,
  });

  // Fetch left file content
  const { data: leftContent, isLoading: loadingLeftContent } = useQuery({
    queryKey: ["file-content-compare", leftRepo, leftFile],
    queryFn: async () => {
      const repo = repos.find(r => r.id === leftRepo);
      if (!repo) return null;
      
      const { data, error } = await supabase.functions.invoke("github-get-file", {
        body: { accountId, repoFullName: repo.fullName, path: leftFile },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!leftRepo && !!leftFile,
  });

  // Fetch right file content
  const { data: rightContent, isLoading: loadingRightContent } = useQuery({
    queryKey: ["file-content-compare", rightRepo, rightFile],
    queryFn: async () => {
      const repo = repos.find(r => r.id === rightRepo);
      if (!repo) return null;
      
      const { data, error } = await supabase.functions.invoke("github-get-file", {
        body: { accountId, repoFullName: repo.fullName, path: rightFile },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!rightRepo && !!rightFile,
  });

  const leftRepoName = repos.find(r => r.id === leftRepo)?.name || "Select Repo";
  const rightRepoName = repos.find(r => r.id === rightRepo)?.name || "Select Repo";
  const isLoading = loadingLeftContent || loadingRightContent;
  const canCompare = leftContent && rightContent;

  const newStyles = {
    variables: {
      dark: {
        diffViewerBackground: 'hsl(var(--background))',
        diffViewerColor: 'hsl(var(--foreground))',
        addedBackground: 'rgba(34, 197, 94, 0.15)',
        addedColor: 'hsl(var(--foreground))',
        removedBackground: 'rgba(239, 68, 68, 0.15)',
        removedColor: 'hsl(var(--foreground))',
        wordAddedBackground: 'rgba(34, 197, 94, 0.3)',
        wordRemovedBackground: 'rgba(239, 68, 68, 0.3)',
        addedGutterBackground: 'rgba(34, 197, 94, 0.2)',
        removedGutterBackground: 'rgba(239, 68, 68, 0.2)',
        gutterBackground: 'hsl(var(--muted))',
        gutterBackgroundDark: 'hsl(var(--muted))',
        highlightBackground: 'rgba(139, 92, 246, 0.1)',
        highlightGutterBackground: 'rgba(139, 92, 246, 0.2)',
        codeFoldGutterBackground: 'hsl(var(--muted))',
        codeFoldBackground: 'hsl(var(--muted))',
        emptyLineBackground: 'hsl(var(--muted))',
        gutterColor: 'hsl(var(--muted-foreground))',
        addedGutterColor: 'hsl(var(--foreground))',
        removedGutterColor: 'hsl(var(--foreground))',
        codeFoldContentColor: 'hsl(var(--muted-foreground))',
        diffViewerTitleBackground: 'hsl(var(--card))',
        diffViewerTitleColor: 'hsl(var(--card-foreground))',
        diffViewerTitleBorderColor: 'hsl(var(--border))',
      },
    },
    line: {
      padding: '4px 8px',
      fontSize: '13px',
      fontFamily: 'ui-monospace, monospace',
    },
    gutter: {
      minWidth: '40px',
      padding: '0 8px',
      fontSize: '12px',
    },
    contentText: {
      fontFamily: 'ui-monospace, monospace',
    },
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100%-1rem)] sm:w-full max-w-7xl h-[90vh] sm:h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 sm:px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <GitCompare className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="truncate">File Comparison</DialogTitle>
              <DialogDescription>Compare files across different repositories</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Selection Controls */}
        <div className="px-4 sm:px-6 py-4 border-b border-border bg-muted/30 shrink-0">
          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8">
            {/* Left Side Selection */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-destructive" />
                Original File
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Repository</Label>
                  <Select value={leftRepo} onValueChange={(v) => { setLeftRepo(v); setLeftFile(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select repo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {repos.map((repo) => (
                        <SelectItem key={repo.id} value={repo.id}>
                          {repo.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">File</Label>
                  <Select value={leftFile} onValueChange={setLeftFile} disabled={!leftRepo || loadingLeftFiles}>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingLeftFiles ? "Loading..." : "Select file..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {leftFiles?.map((file: FileTreeItem) => (
                        <SelectItem key={file.path} value={file.path}>
                          {file.path}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Divider with arrow */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden lg:flex items-center justify-center">
              <div className="p-2 rounded-full bg-background border border-border">
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            {/* Right Side Selection */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-primary" />
                Modified File
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Repository</Label>
                  <Select value={rightRepo} onValueChange={(v) => { setRightRepo(v); setRightFile(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select repo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {repos.map((repo) => (
                        <SelectItem key={repo.id} value={repo.id}>
                          {repo.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">File</Label>
                  <Select value={rightFile} onValueChange={setRightFile} disabled={!rightRepo || loadingRightFiles}>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingRightFiles ? "Loading..." : "Select file..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {rightFiles?.map((file: FileTreeItem) => (
                        <SelectItem key={file.path} value={file.path}>
                          {file.path}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Diff Viewer */}
        <div className="flex-1 overflow-hidden min-h-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(20)].map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : canCompare ? (
            <ScrollArea className="h-full">
              <ReactDiffViewer
                oldValue={leftContent?.content || ""}
                newValue={rightContent?.content || ""}
                splitView={true}
                useDarkTheme={true}
                compareMethod={DiffMethod.WORDS}
                styles={newStyles}
                leftTitle={`${leftRepoName}/${leftFile}`}
                rightTitle={`${rightRepoName}/${rightFile}`}
                showDiffOnly={false}
              />
            </ScrollArea>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="p-4 rounded-full bg-muted/50 inline-flex">
                  <FileCode className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-lg font-medium">Select files to compare</p>
                  <p className="text-sm text-muted-foreground">
                    Choose a repository and file on each side to see the differences
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
