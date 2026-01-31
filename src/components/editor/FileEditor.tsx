import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, X, FileCode, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Highlight, themes } from "prism-react-renderer";

interface FileEditorProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  repoFullName: string;
  filePath: string;
  fileName: string;
  initialContent: string;
  fileSha: string;
  isLoading?: boolean;
}

const getLanguage = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    py: 'python',
    rb: 'ruby',
    java: 'java',
    go: 'go',
    rs: 'rust',
    php: 'php',
    css: 'css',
    scss: 'scss',
    html: 'html',
    xml: 'xml',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
  };
  return languageMap[ext] || 'plaintext';
};

export function FileEditor({
  isOpen,
  onClose,
  accountId,
  repoFullName,
  filePath,
  fileName,
  initialContent,
  fileSha,
  isLoading = false,
}: FileEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [commitMessage, setCommitMessage] = useState(`Update ${fileName}`);
  const [hasChanges, setHasChanges] = useState(false);
  const queryClient = useQueryClient();

  const language = getLanguage(fileName);

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    setHasChanges(newContent !== initialContent);
  }, [initialContent]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('github-save-file', {
        body: {
          accountId,
          repoFullName,
          path: filePath,
          content,
          commitMessage,
          sha: fileSha,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success('File saved successfully', {
        description: `Commit: ${data.commit.sha.slice(0, 7)}`,
      });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['file-content'] });
      queryClient.invalidateQueries({ queryKey: ['sync-history'] });
      queryClient.invalidateQueries({ queryKey: ['repo-commits'] });
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to save file', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const handleSave = () => {
    if (!hasChanges) {
      toast.info('No changes to save');
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => !saveMutation.isPending && onClose()}>
      <DialogContent className="max-w-6xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileCode className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg">{fileName}</DialogTitle>
                <DialogDescription className="text-xs font-mono">
                  {repoFullName}/{filePath}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded-full ${hasChanges ? 'bg-amber-500/10 text-amber-500' : 'bg-green-500/10 text-green-500'}`}>
                {hasChanges ? 'Unsaved changes' : 'Saved'}
              </span>
              <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                {language}
              </span>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(15)].map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : (
            <div className="flex-1 relative overflow-hidden">
              {/* Syntax highlighted background */}
              <ScrollArea className="absolute inset-0 bg-[#1e1e1e]">
                <Highlight theme={themes.vsDark} code={content} language={language as any}>
                  {({ className, style, tokens, getLineProps, getTokenProps }) => (
                    <pre
                      className={`${className} p-4 text-sm font-mono leading-6 pointer-events-none`}
                      style={{ ...style, background: 'transparent', margin: 0 }}
                    >
                      {tokens.map((line, i) => (
                        <div key={i} {...getLineProps({ line })} className="flex">
                          <span className="w-12 text-right pr-4 text-muted-foreground/50 select-none shrink-0">
                            {i + 1}
                          </span>
                          <span>
                            {line.map((token, key) => (
                              <span key={key} {...getTokenProps({ token })} />
                            ))}
                          </span>
                        </div>
                      ))}
                    </pre>
                  )}
                </Highlight>
              </ScrollArea>
              
              {/* Editable textarea overlay */}
              <textarea
                value={content}
                onChange={handleContentChange}
                className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-white p-4 pl-16 text-sm font-mono leading-6 resize-none outline-none overflow-auto"
                spellCheck={false}
                style={{ tabSize: 2 }}
              />
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          <div className="flex items-center justify-between w-full gap-4">
            <Input
              placeholder="Commit message..."
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              className="flex-1"
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={!hasChanges || saveMutation.isPending}
                className="min-w-[100px]"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save & Commit
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
