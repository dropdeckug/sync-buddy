import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Save, X, FileCode, Loader2, AlertTriangle, CheckCircle2, GitBranch } from "lucide-react";
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
  syncGroupId?: string;
}

interface CodeError {
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

const CODE_FONT = "'JetBrains Mono', 'Fira Code', 'Source Code Pro', 'Cascadia Code', 'Consolas', 'Monaco', 'Courier New', monospace";

const getLanguage = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
    py: 'python', rb: 'ruby', java: 'java', go: 'go', rs: 'rust',
    php: 'php', css: 'css', scss: 'scss', html: 'html', xml: 'xml',
    json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown',
    sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash',
  };
  return languageMap[ext] || 'plaintext';
};

function detectErrors(content: string, language: string): CodeError[] {
  const errors: CodeError[] = [];
  const lines = content.split('\n');

  if (language === 'json') {
    try {
      JSON.parse(content);
    } catch (e) {
      const msg = (e as Error).message;
      const posMatch = msg.match(/position (\d+)/i) || msg.match(/line (\d+)/i);
      let line = 1;
      if (posMatch) {
        const pos = parseInt(posMatch[1]);
        if (msg.includes('position')) {
          let count = 0;
          for (let i = 0; i < lines.length; i++) {
            count += lines[i].length + 1;
            if (count >= pos) { line = i + 1; break; }
          }
        } else {
          line = pos;
        }
      }
      errors.push({ line, message: msg, severity: 'error' });
    }
    return errors;
  }

  if (['javascript', 'typescript', 'jsx', 'tsx'].includes(language)) {
    let braceCount = 0, parenCount = 0, bracketCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      for (const ch of line) {
        if (ch === '{') braceCount++;
        else if (ch === '}') braceCount--;
        else if (ch === '(') parenCount++;
        else if (ch === ')') parenCount--;
        else if (ch === '[') bracketCount++;
        else if (ch === ']') bracketCount--;
      }

      // Detect common syntax issues
      if (/console\.(log|warn|error|debug)\s*\(/.test(trimmed)) {
        errors.push({ line: i + 1, message: 'Console statement detected', severity: 'warning' });
      }
      
      if (/\bvar\b/.test(trimmed)) {
        errors.push({ line: i + 1, message: "'var' is deprecated, use 'let' or 'const'", severity: 'warning' });
      }

      if (braceCount < 0) {
        errors.push({ line: i + 1, message: 'Unexpected closing brace "}"', severity: 'error' });
        braceCount = 0;
      }
      if (parenCount < 0) {
        errors.push({ line: i + 1, message: 'Unexpected closing parenthesis ")"', severity: 'error' });
        parenCount = 0;
      }
      if (bracketCount < 0) {
        errors.push({ line: i + 1, message: 'Unexpected closing bracket "]"', severity: 'error' });
        bracketCount = 0;
      }
    }

    if (braceCount > 0) errors.push({ line: lines.length, message: `Missing ${braceCount} closing brace(s) "}"`, severity: 'error' });
    if (parenCount > 0) errors.push({ line: lines.length, message: `Missing ${parenCount} closing parenthesis(es) ")"`, severity: 'error' });
    if (bracketCount > 0) errors.push({ line: lines.length, message: `Missing ${bracketCount} closing bracket(s) "]"`, severity: 'error' });
  }

  if (['html', 'xml'].includes(language)) {
    const tagStack: { tag: string; line: number }[] = [];
    const selfClosing = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);
    
    for (let i = 0; i < lines.length; i++) {
      const openTags = lines[i].matchAll(/<([a-zA-Z][a-zA-Z0-9]*)[^>]*(?<!\/)>/g);
      const closeTags = lines[i].matchAll(/<\/([a-zA-Z][a-zA-Z0-9]*)>/g);

      for (const m of openTags) {
        const tag = m[1].toLowerCase();
        if (!selfClosing.has(tag)) tagStack.push({ tag, line: i + 1 });
      }
      for (const m of closeTags) {
        const tag = m[1].toLowerCase();
        if (tagStack.length > 0 && tagStack[tagStack.length - 1].tag === tag) {
          tagStack.pop();
        } else {
          errors.push({ line: i + 1, message: `Unexpected closing tag </${tag}>`, severity: 'error' });
        }
      }
    }
    for (const unclosed of tagStack) {
      errors.push({ line: unclosed.line, message: `Unclosed tag <${unclosed.tag}>`, severity: 'error' });
    }
  }

  return errors;
}

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
  syncGroupId,
}: FileEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [commitMessage, setCommitMessage] = useState(`Update ${fileName}`);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const language = getLanguage(fileName);

  const errors = useMemo(() => detectErrors(content, language), [content, language]);
  const errorLines = useMemo(() => new Set(errors.filter(e => e.severity === 'error').map(e => e.line)), [errors]);
  const warningLines = useMemo(() => new Set(errors.filter(e => e.severity === 'warning').map(e => e.line)), [errors]);
  const errorCount = errors.filter(e => e.severity === 'error').length;
  const warningCount = errors.filter(e => e.severity === 'warning').length;

  // Sync scroll between textarea and highlighted code
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const handleScroll = () => {
      const scrollContainer = textarea.closest('.editor-scroll-wrapper');
      const preEl = preRef.current;
      if (preEl && scrollContainer) {
        preEl.style.transform = `translateY(-${textarea.scrollTop}px)`;
        preEl.style.marginLeft = `-${textarea.scrollLeft}px`;
      }
    };
    textarea.addEventListener('scroll', handleScroll);
    return () => textarea.removeEventListener('scroll', handleScroll);
  }, []);

  // Reset content when initialContent changes
  useEffect(() => {
    setContent(initialContent);
    setHasChanges(false);
    setCommitMessage(`Update ${fileName}`);
  }, [initialContent, fileName]);

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    setHasChanges(newContent !== initialContent);
  }, [initialContent]);

  // Handle Tab key for indentation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.substring(0, start) + '  ' + content.substring(end);
      setContent(newContent);
      setHasChanges(newContent !== initialContent);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
  }, [content, initialContent]);

  const triggerSync = useCallback(async () => {
    if (!syncGroupId) return;
    setIsSyncing(true);
    try {
      const { error } = await supabase.functions.invoke('sync-repos', {
        body: { syncGroupId, accountId },
      });
      if (error) throw error;
      toast.success('Sync triggered across all repositories', {
        description: 'Changes are being synced to all repos in the project.',
      });
    } catch (err) {
      toast.error('Sync trigger failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsSyncing(false);
    }
  }, [syncGroupId, accountId]);

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
    onSuccess: async (data) => {
      toast.success('File saved successfully', {
        description: `Commit: ${data.commit.sha.slice(0, 7)}`,
      });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['file-content'] });
      queryClient.invalidateQueries({ queryKey: ['sync-history'] });
      queryClient.invalidateQueries({ queryKey: ['repo-commits'] });

      // Trigger cross-repo sync after save
      if (syncGroupId) {
        await triggerSync();
      }

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
    if (errorCount > 0) {
      toast.warning(`File has ${errorCount} error(s). Save anyway?`, {
        action: {
          label: 'Save anyway',
          onClick: () => saveMutation.mutate(),
        },
      });
      return;
    }
    saveMutation.mutate();
  };

  const isPending = saveMutation.isPending || isSyncing;

  return (
    <Dialog open={isOpen} onOpenChange={() => !isPending && onClose()}>
      <DialogContent className="w-[calc(100%-1rem)] sm:w-full max-w-6xl h-[90vh] sm:h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 sm:px-6 py-4 border-b border-border shrink-0">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                <FileCode className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base sm:text-lg truncate" style={{ fontFamily: CODE_FONT }}>
                  {fileName}
                </DialogTitle>
                <DialogDescription className="text-xs truncate" style={{ fontFamily: CODE_FONT }}>
                  {repoFullName}/{filePath}
                </DialogDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {errorCount > 0 && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {errorCount} error{errorCount !== 1 ? 's' : ''}
                </Badge>
              )}
              {warningCount > 0 && (
                <Badge variant="outline" className="text-xs gap-1 border-amber-500/50 text-amber-500">
                  <AlertTriangle className="h-3 w-3" />
                  {warningCount} warning{warningCount !== 1 ? 's' : ''}
                </Badge>
              )}
              {errorCount === 0 && warningCount === 0 && hasChanges && (
                <Badge variant="outline" className="text-xs gap-1 border-green-500/50 text-green-500">
                  <CheckCircle2 className="h-3 w-3" />
                  No issues
                </Badge>
              )}
              <span className={`text-xs px-2 py-1 rounded-full ${hasChanges ? 'bg-amber-500/10 text-amber-500' : 'bg-green-500/10 text-green-500'}`}>
                {hasChanges ? 'Unsaved changes' : 'Saved'}
              </span>
              <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground" style={{ fontFamily: CODE_FONT }}>
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
            <div className="flex-1 relative overflow-hidden editor-scroll-wrapper">
              {/* Syntax highlighted background */}
              <div className="absolute inset-0 bg-[#1e1e1e] overflow-hidden pointer-events-none">
                <Highlight theme={themes.vsDark} code={content} language={language as any}>
                  {({ className, style, tokens, getLineProps, getTokenProps }) => (
                    <pre
                      ref={preRef}
                      className={`${className} p-4 text-sm leading-6`}
                      style={{ ...style, background: 'transparent', margin: 0, fontFamily: CODE_FONT }}
                    >
                      {tokens.map((line, i) => {
                        const lineNum = i + 1;
                        const hasError = errorLines.has(lineNum);
                        const hasWarning = warningLines.has(lineNum);
                        return (
                          <div
                            key={i}
                            {...getLineProps({ line })}
                            className={`flex ${hasError ? 'bg-red-500/10 border-l-2 border-red-500' : hasWarning ? 'bg-amber-500/5 border-l-2 border-amber-500/50' : ''}`}
                            title={errors.find(e => e.line === lineNum)?.message}
                          >
                            <span
                              className={`w-12 text-right pr-4 select-none shrink-0 ${hasError ? 'text-red-400' : hasWarning ? 'text-amber-400/70' : 'text-muted-foreground/50'}`}
                              style={{ fontFamily: CODE_FONT }}
                            >
                              {lineNum}
                            </span>
                            <span>
                              {line.map((token, key) => (
                                <span key={key} {...getTokenProps({ token })} />
                              ))}
                            </span>
                          </div>
                        );
                      })}
                    </pre>
                  )}
                </Highlight>
              </div>
              
              {/* Editable textarea overlay */}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleContentChange}
                onKeyDown={handleKeyDown}
                className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-white p-4 pl-16 text-sm leading-6 resize-none outline-none overflow-auto"
                spellCheck={false}
                style={{ tabSize: 2, fontFamily: CODE_FONT }}
              />
            </div>
          )}
        </div>

        {/* Error panel */}
        {errors.length > 0 && (
          <div className="px-6 py-2 border-t border-border bg-card max-h-28 overflow-auto shrink-0">
            <div className="space-y-1">
              {errors.slice(0, 10).map((error, i) => (
                <div key={i} className="flex items-center gap-2 text-xs" style={{ fontFamily: CODE_FONT }}>
                  <AlertTriangle className={`h-3 w-3 shrink-0 ${error.severity === 'error' ? 'text-red-400' : 'text-amber-400'}`} />
                  <span className="text-muted-foreground">Line {error.line}:</span>
                  <span className={error.severity === 'error' ? 'text-red-400' : 'text-amber-400'}>{error.message}</span>
                </div>
              ))}
              {errors.length > 10 && (
                <span className="text-xs text-muted-foreground">...and {errors.length - 10} more</span>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="px-4 sm:px-6 py-4 border-t border-border shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full gap-3 sm:gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 min-w-0">
              <Input
                placeholder="Commit message..."
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                className="flex-1"
                style={{ fontFamily: CODE_FONT }}
              />
              {syncGroupId && (
                <Badge variant="outline" className="shrink-0 gap-1 text-xs text-primary border-primary/30 w-fit">
                  <GitBranch className="h-3 w-3" />
                  Auto-sync
                </Badge>
              )}
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" onClick={onClose} disabled={isPending} className="flex-1 sm:flex-none">
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={!hasChanges || isPending}
                className="flex-1 sm:flex-none sm:min-w-[140px]"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {isSyncing ? 'Syncing...' : 'Saving...'}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save & Sync
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
