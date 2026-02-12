import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Save, X, FileCode, Loader2, AlertTriangle, CheckCircle2,
  GitBranch, Folder, FileText, ChevronRight, ChevronLeft,
  Edit3, Eye, PanelRightOpen, PanelRightClose, ArrowLeft
} from "lucide-react";
import { toast } from "sonner";
import { Highlight, themes } from "prism-react-renderer";

const CODE_FONT = "'JetBrains Mono', 'Fira Code', 'Source Code Pro', 'Cascadia Code', 'Consolas', monospace";

interface FullScreenEditorProps {
  accountId: string;
  syncGroupId: string;
  repos: Array<{ id: string; name: string; full_name: string; isMother?: boolean }>;
  onClose: () => void;
}

interface CodeError {
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

const getLanguage = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
    py: 'python', css: 'css', scss: 'scss', html: 'html', xml: 'xml',
    json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown',
    sql: 'sql', sh: 'bash', bash: 'bash', go: 'go', rs: 'rust',
    java: 'java', php: 'php', rb: 'ruby',
  };
  return map[ext] || 'plaintext';
};

function detectErrors(content: string, language: string): CodeError[] {
  const errors: CodeError[] = [];
  const lines = content.split('\n');

  if (language === 'json') {
    try { JSON.parse(content); } catch (e) {
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
        } else { line = pos; }
      }
      errors.push({ line, message: msg, severity: 'error' });
    }
    return errors;
  }

  if (['javascript', 'typescript', 'jsx', 'tsx'].includes(language)) {
    let braceCount = 0, parenCount = 0, bracketCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      for (const ch of lines[i]) {
        if (ch === '{') braceCount++; else if (ch === '}') braceCount--;
        else if (ch === '(') parenCount++; else if (ch === ')') parenCount--;
        else if (ch === '[') bracketCount++; else if (ch === ']') bracketCount--;
      }
      if (/\bvar\b/.test(trimmed)) errors.push({ line: i + 1, message: "'var' is deprecated, use 'let' or 'const'", severity: 'warning' });
      if (braceCount < 0) { errors.push({ line: i + 1, message: 'Unexpected closing brace "}"', severity: 'error' }); braceCount = 0; }
      if (parenCount < 0) { errors.push({ line: i + 1, message: 'Unexpected closing parenthesis ")"', severity: 'error' }); parenCount = 0; }
      if (bracketCount < 0) { errors.push({ line: i + 1, message: 'Unexpected closing bracket "]"', severity: 'error' }); bracketCount = 0; }
    }
    if (braceCount > 0) errors.push({ line: lines.length, message: `Missing ${braceCount} closing brace(s)`, severity: 'error' });
    if (parenCount > 0) errors.push({ line: lines.length, message: `Missing ${parenCount} closing parenthesis(es)`, severity: 'error' });
    if (bracketCount > 0) errors.push({ line: lines.length, message: `Missing ${bracketCount} closing bracket(s)`, severity: 'error' });
  }

  if (['html', 'xml'].includes(language)) {
    const tagStack: { tag: string; line: number }[] = [];
    const selfClosing = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);
    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i].matchAll(/<([a-zA-Z][a-zA-Z0-9]*)[^>]*(?<!\/)>/g)) {
        const tag = m[1].toLowerCase();
        if (!selfClosing.has(tag)) tagStack.push({ tag, line: i + 1 });
      }
      for (const m of lines[i].matchAll(/<\/([a-zA-Z][a-zA-Z0-9]*)>/g)) {
        const tag = m[1].toLowerCase();
        if (tagStack.length > 0 && tagStack[tagStack.length - 1].tag === tag) tagStack.pop();
        else errors.push({ line: i + 1, message: `Unexpected closing tag </${tag}>`, severity: 'error' });
      }
    }
    for (const u of tagStack) errors.push({ line: u.line, message: `Unclosed tag <${u.tag}>`, severity: 'error' });
  }

  return errors;
}

export function FullScreenEditor({ accountId, syncGroupId, repos, onClose }: FullScreenEditorProps) {
  const [selectedRepo, setSelectedRepo] = useState(repos[0] || null);
  const [currentPath, setCurrentPath] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const queryClient = useQueryClient();

  const fileName = selectedFile?.split('/').pop() || '';
  const language = getLanguage(fileName);
  const errors = useMemo(() => detectErrors(content, language), [content, language]);
  const errorLines = useMemo(() => new Set(errors.filter(e => e.severity === 'error').map(e => e.line)), [errors]);
  const warningLines = useMemo(() => new Set(errors.filter(e => e.severity === 'warning').map(e => e.line)), [errors]);
  const errorCount = errors.filter(e => e.severity === 'error').length;
  const warningCount = errors.filter(e => e.severity === 'warning').length;

  // Fetch directory contents
  const { data: contents, isLoading: loadingContents } = useQuery({
    queryKey: ["editor-browse", selectedRepo?.id, currentPath],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("github-browse", {
        body: { accountId, repoId: selectedRepo!.id, path: currentPath },
      });
      if (error) throw error;
      return data.contents as Array<{ name: string; path: string; type: string }>;
    },
    enabled: !!selectedRepo?.id,
  });

  // Fetch file content
  const { data: fileData, isLoading: loadingFile } = useQuery({
    queryKey: ["editor-file", selectedRepo?.full_name, selectedFile],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("github-get-file", {
        body: { accountId, repoFullName: selectedRepo!.full_name, path: selectedFile },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedFile && !!selectedRepo?.full_name,
  });

  useEffect(() => {
    if (fileData?.content != null) {
      setContent(fileData.content);
      setHasChanges(false);
      setCommitMessage(`Update ${fileData.name || selectedFile}`);
      setEditMode(false);
    }
  }, [fileData, selectedFile]);

  // Sync scroll
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const handleScroll = () => {
      if (preRef.current) {
        preRef.current.style.transform = `translateY(-${ta.scrollTop}px)`;
        preRef.current.style.marginLeft = `-${ta.scrollLeft}px`;
      }
    };
    ta.addEventListener('scroll', handleScroll);
    return () => ta.removeEventListener('scroll', handleScroll);
  }, [editMode, selectedFile]);

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setContent(v);
    setHasChanges(v !== (fileData?.content || ''));
  }, [fileData]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart, end = ta.selectionEnd;
      const v = content.substring(0, start) + '  ' + content.substring(end);
      setContent(v);
      setHasChanges(v !== (fileData?.content || ''));
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
    }
  }, [content, fileData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('github-save-file', {
        body: { accountId, repoFullName: selectedRepo!.full_name, path: selectedFile, content, commitMessage, sha: fileData?.sha },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: async (data) => {
      toast.success('File saved', { description: `Commit: ${data.commit.sha.slice(0, 7)}` });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['editor-file'] });
      queryClient.invalidateQueries({ queryKey: ['repo-commits'] });
      // Trigger sync
      setIsSyncing(true);
      try {
        await supabase.functions.invoke('sync-repos', { body: { syncGroupId, accountId } });
        toast.success('Synced across all repositories');
      } catch (err) {
        toast.error('Sync failed');
      } finally {
        setIsSyncing(false);
      }
    },
    onError: (error) => {
      toast.error('Failed to save', { description: error instanceof Error ? error.message : 'Unknown error' });
    },
  });

  const handleSave = () => {
    if (!hasChanges) { toast.info('No changes to save'); return; }
    if (errorCount > 0) {
      toast.warning(`File has ${errorCount} error(s). Save anyway?`, {
        action: { label: 'Save anyway', onClick: () => saveMutation.mutate() },
      });
      return;
    }
    saveMutation.mutate();
  };

  const isPending = saveMutation.isPending || isSyncing;

  const navigateToFolder = (path: string) => { setCurrentPath(path); setSelectedFile(null); };
  const goBack = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  const pathBreadcrumbs = currentPath ? currentPath.split('/').filter(Boolean) : [];

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="h-6 w-px bg-border" />
          <FileCode className="h-5 w-5 text-primary" />
          <span className="font-semibold" style={{ fontFamily: CODE_FONT }}>File Editor</span>
        </div>
        <div className="flex items-center gap-2">
          {selectedFile && (
            <>
              {errorCount > 0 && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertTriangle className="h-3 w-3" />{errorCount} error{errorCount !== 1 ? 's' : ''}
                </Badge>
              )}
              {warningCount > 0 && (
                <Badge variant="outline" className="text-xs gap-1 border-amber-500/50 text-amber-500">
                  <AlertTriangle className="h-3 w-3" />{warningCount}
                </Badge>
              )}
              {errorCount === 0 && warningCount === 0 && hasChanges && (
                <Badge variant="outline" className="text-xs gap-1 border-green-500/50 text-green-500">
                  <CheckCircle2 className="h-3 w-3" />No issues
                </Badge>
              )}
              <Button
                variant={editMode ? "default" : "outline"}
                size="sm"
                onClick={() => setEditMode(!editMode)}
              >
                {editMode ? <><Edit3 className="h-4 w-4 mr-1" />Editing</> : <><Eye className="h-4 w-4 mr-1" />View</>}
              </Button>
              {editMode && hasChanges && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Commit message..."
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    className="w-64 h-8 text-xs"
                    style={{ fontFamily: CODE_FONT }}
                  />
                  <Button size="sm" onClick={handleSave} disabled={isPending} className="min-w-[120px]">
                    {isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />{isSyncing ? 'Syncing...' : 'Saving...'}</> : <><Save className="h-4 w-4 mr-1" />Save & Sync</>}
                  </Button>
                </div>
              )}
            </>
          )}
          <Button variant="ghost" size="icon" onClick={() => setRightPanelOpen(!rightPanelOpen)}>
            {rightPanelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: file tree */}
        <div className="w-[280px] shrink-0 border-r border-border flex flex-col bg-card">
          {/* Repo selector */}
          <div className="p-3 border-b border-border space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Repository</span>
            <div className="space-y-1">
              {repos.map((repo) => (
                <button
                  key={repo.id}
                  onClick={() => { setSelectedRepo(repo); setCurrentPath(''); setSelectedFile(null); }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors ${
                    selectedRepo?.id === repo.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <GitBranch className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate" style={{ fontFamily: CODE_FONT }}>{repo.name}</span>
                  {repo.isMother && <Badge variant="outline" className="text-[10px] px-1 py-0 ml-auto shrink-0">M</Badge>}
                </button>
              ))}
            </div>
          </div>

          {/* Breadcrumbs */}
          <div className="px-3 py-2 border-b border-border flex items-center gap-1 text-xs" style={{ fontFamily: CODE_FONT }}>
            <button onClick={() => { setCurrentPath(''); setSelectedFile(null); }} className="text-muted-foreground hover:text-foreground">/</button>
            {pathBreadcrumbs.map((part, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <button
                  onClick={() => navigateToFolder(pathBreadcrumbs.slice(0, i + 1).join('/'))}
                  className="text-muted-foreground hover:text-foreground"
                >{part}</button>
              </span>
            ))}
          </div>

          {/* File list */}
          <ScrollArea className="flex-1">
            {loadingContents ? (
              <div className="p-3 space-y-2">
                {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <div className="p-1">
                {currentPath && (
                  <button
                    onClick={goBack}
                    className="w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 hover:bg-muted text-muted-foreground"
                    style={{ fontFamily: CODE_FONT }}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>..</span>
                  </button>
                )}
                {contents?.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => item.type === 'dir' ? navigateToFolder(item.path) : setSelectedFile(item.path)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors ${
                      selectedFile === item.path ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'
                    }`}
                    style={{ fontFamily: CODE_FONT }}
                  >
                    {item.type === 'dir' ? (
                      <Folder className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="truncate">{item.name}</span>
                    {item.type === 'dir' && <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Middle: code editor */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selectedFile ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center space-y-3">
                <FileCode className="h-16 w-16 mx-auto opacity-20" />
                <p className="text-lg">Select a file to view</p>
                <p className="text-sm">Browse the file tree on the left</p>
              </div>
            </div>
          ) : loadingFile ? (
            <div className="p-6 space-y-2">
              {[...Array(20)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
            </div>
          ) : (
            <>
              {/* File tab */}
              <div className="shrink-0 px-4 py-2 border-b border-border flex items-center gap-2 bg-card/50">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium" style={{ fontFamily: CODE_FONT }}>{fileName}</span>
                <span className="text-xs text-muted-foreground" style={{ fontFamily: CODE_FONT }}>({language})</span>
                {hasChanges && <span className="h-2 w-2 rounded-full bg-amber-500 ml-1" />}
              </div>

              {/* Code area */}
              <div className="flex-1 relative overflow-hidden">
                <div className="absolute inset-0 bg-[#1e1e1e] overflow-auto" style={editMode ? { pointerEvents: 'none' } : undefined}>
                  <Highlight theme={themes.vsDark} code={content} language={language as any}>
                    {({ className, style, tokens, getLineProps, getTokenProps }) => (
                      <pre
                        ref={preRef}
                        className={className}
                        style={{ ...style, background: 'transparent', margin: 0, padding: '1rem', fontFamily: CODE_FONT, fontSize: '15px', lineHeight: '1.7' }}
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
                                className={`w-14 text-right pr-4 select-none shrink-0 ${hasError ? 'text-red-400' : hasWarning ? 'text-amber-400/70' : 'text-muted-foreground/40'}`}
                                style={{ fontFamily: CODE_FONT, fontSize: '14px' }}
                              >{lineNum}</span>
                              <span>{line.map((token, key) => <span key={key} {...getTokenProps({ token })} />)}</span>
                            </div>
                          );
                        })}
                      </pre>
                    )}
                  </Highlight>
                </div>

                {editMode && (
                  <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={handleContentChange}
                    onKeyDown={handleKeyDown}
                    className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-white resize-none outline-none overflow-auto"
                    spellCheck={false}
                    style={{ tabSize: 2, fontFamily: CODE_FONT, fontSize: '15px', lineHeight: '1.7', padding: '1rem', paddingLeft: '4.5rem' }}
                  />
                )}
              </div>

              {/* Problems panel */}
              {errors.length > 0 && (
                <div className="shrink-0 px-4 py-2 border-t border-border bg-card max-h-32 overflow-auto">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Problems ({errors.length})</span>
                  <div className="mt-1 space-y-0.5">
                    {errors.slice(0, 15).map((err, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs" style={{ fontFamily: CODE_FONT }}>
                        <AlertTriangle className={`h-3 w-3 shrink-0 ${err.severity === 'error' ? 'text-red-400' : 'text-amber-400'}`} />
                        <span className="text-muted-foreground">Ln {err.line}:</span>
                        <span className={err.severity === 'error' ? 'text-red-400' : 'text-amber-400'}>{err.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: expandable panel */}
        {rightPanelOpen && (
          <div className="w-[300px] shrink-0 border-l border-border bg-card flex flex-col">
            <div className="p-4 border-b border-border">
              <h3 className="text-sm font-semibold">File Info</h3>
            </div>
            <ScrollArea className="flex-1 p-4">
              {selectedFile && fileData ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">File</span>
                    <p className="text-sm font-medium" style={{ fontFamily: CODE_FONT }}>{fileData.name}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Path</span>
                    <p className="text-xs break-all" style={{ fontFamily: CODE_FONT }}>{selectedFile}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Repository</span>
                    <p className="text-sm" style={{ fontFamily: CODE_FONT }}>{selectedRepo?.full_name}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Language</span>
                    <Badge variant="outline" className="text-xs">{language}</Badge>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Size</span>
                    <p className="text-sm" style={{ fontFamily: CODE_FONT }}>{content.length.toLocaleString()} chars · {content.split('\n').length} lines</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">SHA</span>
                    <p className="text-xs break-all" style={{ fontFamily: CODE_FONT }}>{fileData.sha}</p>
                  </div>

                  <div className="pt-2 border-t border-border space-y-1">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Status</span>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${editMode ? 'bg-amber-500' : 'bg-green-500'}`} />
                        <span className="text-sm">{editMode ? 'Edit Mode' : 'View Mode'}</span>
                      </div>
                      {hasChanges && (
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                          <span className="text-sm text-amber-500">Unsaved changes</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        {errorCount > 0 ? (
                          <><AlertTriangle className="h-3 w-3 text-red-400" /><span className="text-sm text-red-400">{errorCount} error(s)</span></>
                        ) : warningCount > 0 ? (
                          <><AlertTriangle className="h-3 w-3 text-amber-400" /><span className="text-sm text-amber-400">{warningCount} warning(s)</span></>
                        ) : (
                          <><CheckCircle2 className="h-3 w-3 text-green-500" /><span className="text-sm text-green-500">No issues</span></>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground text-sm py-8">
                  Select a file to see its info
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
