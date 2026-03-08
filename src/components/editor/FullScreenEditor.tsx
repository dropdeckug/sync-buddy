import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Save, FileCode, Loader2, AlertTriangle, CheckCircle2,
  GitBranch, Folder, FileText, ChevronRight, ChevronLeft,
  Edit3, Eye, PanelRightOpen, PanelRightClose, ArrowLeft,
  Search, Terminal, X
} from "lucide-react";
import { toast } from "sonner";
import { Highlight, themes } from "prism-react-renderer";

const CODE_FONT = "'JetBrains Mono', 'Fira Code', 'Source Code Pro', monospace";

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

const getFileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const colors: Record<string, string> = {
    ts: 'text-blue-400', tsx: 'text-blue-400', js: 'text-yellow-400', jsx: 'text-yellow-400',
    css: 'text-purple-400', html: 'text-orange-400', json: 'text-green-400',
    md: 'text-muted-foreground', py: 'text-emerald-400',
  };
  return colors[ext] || 'text-muted-foreground';
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
      if (braceCount < 0) { errors.push({ line: i + 1, message: 'Unexpected closing brace', severity: 'error' }); braceCount = 0; }
      if (parenCount < 0) { errors.push({ line: i + 1, message: 'Unexpected closing paren', severity: 'error' }); parenCount = 0; }
      if (bracketCount < 0) { errors.push({ line: i + 1, message: 'Unexpected closing bracket', severity: 'error' }); bracketCount = 0; }
    }
    if (braceCount > 0) errors.push({ line: lines.length, message: `Missing ${braceCount} closing brace(s)`, severity: 'error' });
    if (parenCount > 0) errors.push({ line: lines.length, message: `Missing ${parenCount} closing paren(s)`, severity: 'error' });
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
        else errors.push({ line: i + 1, message: `Unexpected </${tag}>`, severity: 'error' });
      }
    }
    for (const u of tagStack) errors.push({ line: u.line, message: `Unclosed <${u.tag}>`, severity: 'error' });
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
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [fileSearch, setFileSearch] = useState("");
  const [showProblems, setShowProblems] = useState(false);
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
      toast.success('Saved', { description: `${data.commit.sha.slice(0, 7)}` });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['editor-file'] });
      queryClient.invalidateQueries({ queryKey: ['repo-commits'] });
      setIsSyncing(true);
      try {
        await supabase.functions.invoke('sync-repos', { body: { syncGroupId, accountId } });
        toast.success('Synced across repositories');
      } catch { toast.error('Sync failed'); }
      finally { setIsSyncing(false); }
    },
    onError: (error) => {
      toast.error('Save failed', { description: error instanceof Error ? error.message : 'Unknown' });
    },
  });

  const handleSave = () => {
    if (!hasChanges) { toast.info('No changes'); return; }
    if (errorCount > 0) {
      toast.warning(`${errorCount} error(s). Save anyway?`, {
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
  const filteredContents = contents?.filter(item =>
    !fileSearch || item.name.toLowerCase().includes(fileSearch.toLowerCase())
  );

  return (
    <div className="h-screen flex flex-col bg-[#0d1117]">
      {/* Title bar */}
      <div className="shrink-0 flex items-center justify-between h-10 px-3 bg-[#161b22] border-b border-[#30363d]">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 px-2 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#30363d]">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            <span className="text-xs">Back</span>
          </Button>
          <Separator orientation="vertical" className="h-4 bg-[#30363d]" />
          <FileCode className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-[#e6edf3]" style={{ fontFamily: CODE_FONT }}>Editor</span>
          {selectedFile && (
            <>
              <Separator orientation="vertical" className="h-4 bg-[#30363d]" />
              <span className="text-xs text-[#8b949e]" style={{ fontFamily: CODE_FONT }}>{fileName}</span>
              {hasChanges && <span className="h-2 w-2 rounded-full bg-amber-500" />}
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {selectedFile && (
            <>
              {errorCount > 0 && (
                <button onClick={() => setShowProblems(!showProblems)} className="flex items-center gap-1 px-2 h-6 rounded text-[10px] bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors">
                  <X className="w-3 h-3" />{errorCount}
                </button>
              )}
              {warningCount > 0 && (
                <button onClick={() => setShowProblems(!showProblems)} className="flex items-center gap-1 px-2 h-6 rounded text-[10px] bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors">
                  <AlertTriangle className="w-3 h-3" />{warningCount}
                </button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditMode(!editMode)}
                className={`h-7 px-2 text-xs ${editMode ? 'bg-primary/15 text-primary' : 'text-[#8b949e] hover:text-[#e6edf3]'} hover:bg-[#30363d]`}
              >
                {editMode ? <><Edit3 className="h-3 w-3 mr-1" />Edit</> : <><Eye className="h-3 w-3 mr-1" />View</>}
              </Button>
              {editMode && hasChanges && (
                <>
                  <Input
                    placeholder="Commit message..."
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    className="w-48 h-7 text-[10px] bg-[#0d1117] border-[#30363d] text-[#e6edf3] rounded"
                    style={{ fontFamily: CODE_FONT }}
                  />
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={isPending}
                    className="h-7 px-3 text-xs rounded gap-1"
                  >
                    {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    {isSyncing ? 'Syncing' : isPending ? 'Saving' : 'Save & Sync'}
                  </Button>
                </>
              )}
            </>
          )}
          <Separator orientation="vertical" className="h-4 bg-[#30363d]" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            className="h-7 w-7 p-0 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#30363d]"
          >
            {rightPanelOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: repos + files */}
        <div className="w-[240px] shrink-0 border-r border-[#30363d] flex flex-col bg-[#0d1117]">
          {/* Repo tabs */}
          <div className="shrink-0 border-b border-[#30363d]">
            <ScrollArea className="max-h-24">
              <div className="p-1.5 space-y-0.5">
                {repos.map((repo) => (
                  <button
                    key={repo.id}
                    onClick={() => { setSelectedRepo(repo); setCurrentPath(''); setSelectedFile(null); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-[11px] flex items-center gap-2 transition-all ${
                      selectedRepo?.id === repo.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]'
                    }`}
                    style={{ fontFamily: CODE_FONT }}
                  >
                    <GitBranch className="h-3 w-3 shrink-0" />
                    <span className="truncate">{repo.name}</span>
                    {repo.isMother && <Badge className="text-[8px] px-1 py-0 h-3.5 bg-primary/15 text-primary border-0 ml-auto">SRC</Badge>}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Search */}
          <div className="shrink-0 p-1.5 border-b border-[#30363d]">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#484f58]" />
              <Input
                value={fileSearch}
                onChange={e => setFileSearch(e.target.value)}
                placeholder="Filter files..."
                className="h-7 pl-7 text-[10px] bg-[#0d1117] border-[#30363d] text-[#e6edf3] rounded"
                style={{ fontFamily: CODE_FONT }}
              />
            </div>
          </div>

          {/* Breadcrumbs */}
          <div className="shrink-0 px-2.5 py-1.5 border-b border-[#21262d] flex items-center gap-0.5 text-[10px] text-[#8b949e] overflow-x-auto" style={{ fontFamily: CODE_FONT }}>
            <button onClick={() => { setCurrentPath(''); setSelectedFile(null); }} className="hover:text-[#e6edf3] shrink-0">~</button>
            {pathBreadcrumbs.map((part, i) => (
              <span key={i} className="flex items-center gap-0.5 shrink-0">
                <ChevronRight className="h-2.5 w-2.5" />
                <button
                  onClick={() => navigateToFolder(pathBreadcrumbs.slice(0, i + 1).join('/'))}
                  className="hover:text-[#e6edf3]"
                >{part}</button>
              </span>
            ))}
          </div>

          {/* File tree */}
          <ScrollArea className="flex-1">
            {loadingContents ? (
              <div className="p-2 space-y-1">
                {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-6 w-full bg-[#161b22]" />)}
              </div>
            ) : (
              <div className="p-1">
                {currentPath && (
                  <button
                    onClick={goBack}
                    className="w-full text-left px-2.5 py-1.5 rounded text-[11px] flex items-center gap-2 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]"
                    style={{ fontFamily: CODE_FONT }}
                  >
                    <ChevronLeft className="h-3 w-3" /><span>..</span>
                  </button>
                )}
                {filteredContents?.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => item.type === 'dir' ? navigateToFolder(item.path) : setSelectedFile(item.path)}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-[11px] flex items-center gap-2 transition-all ${
                      selectedFile === item.path
                        ? 'bg-primary/10 text-primary'
                        : 'text-[#e6edf3] hover:bg-[#161b22]'
                    }`}
                    style={{ fontFamily: CODE_FONT }}
                  >
                    {item.type === 'dir' ? (
                      <Folder className="h-3 w-3 text-[#54aeff] shrink-0" />
                    ) : (
                      <FileText className={`h-3 w-3 shrink-0 ${getFileIcon(item.name)}`} />
                    )}
                    <span className="truncate">{item.name}</span>
                    {item.type === 'dir' && <ChevronRight className="h-2.5 w-2.5 ml-auto text-[#484f58] shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Code area */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selectedFile ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                <FileCode className="h-14 w-14 mx-auto text-[#30363d]" />
                <p className="text-sm text-[#8b949e]">Select a file to view</p>
                <p className="text-[10px] text-[#484f58]">Browse the file tree on the left</p>
              </div>
            </div>
          ) : loadingFile ? (
            <div className="p-6 space-y-1.5">
              {[...Array(20)].map((_, i) => <Skeleton key={i} className="h-4 w-full bg-[#161b22]" />)}
            </div>
          ) : (
            <>
              {/* File tabs */}
              <div className="shrink-0 h-8 px-2 flex items-center gap-1 bg-[#161b22] border-b border-[#30363d]">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-t bg-[#0d1117] border border-[#30363d] border-b-0 text-[11px] text-[#e6edf3]" style={{ fontFamily: CODE_FONT }}>
                  <FileText className={`h-3 w-3 ${getFileIcon(fileName)}`} />
                  {fileName}
                  {hasChanges && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                </div>
                <span className="ml-auto text-[9px] text-[#484f58] px-2" style={{ fontFamily: CODE_FONT }}>{language} · {content.split('\n').length} lines</span>
              </div>

              {/* Editor */}
              <div className="flex-1 relative overflow-hidden bg-[#0d1117]">
                <div className="absolute inset-0 overflow-auto" style={editMode ? { pointerEvents: 'none' } : undefined}>
                  <Highlight theme={themes.vsDark} code={content} language={language as any}>
                    {({ className, style, tokens, getLineProps, getTokenProps }) => (
                      <pre
                        ref={preRef}
                        className={className}
                        style={{ ...style, background: 'transparent', margin: 0, padding: '0.5rem 0', fontFamily: CODE_FONT, fontSize: '13px', lineHeight: '20px' }}
                      >
                        {tokens.map((line, i) => {
                          const lineNum = i + 1;
                          const hasError = errorLines.has(lineNum);
                          const hasWarning = warningLines.has(lineNum);
                          return (
                            <div
                              key={i}
                              {...getLineProps({ line })}
                              className={`flex px-2 ${
                                hasError ? 'bg-red-500/8 border-l-2 border-red-500' :
                                hasWarning ? 'bg-amber-500/5 border-l-2 border-amber-500/40' :
                                'border-l-2 border-transparent'
                              } hover:bg-[#161b22]/50`}
                              title={errors.find(e => e.line === lineNum)?.message}
                            >
                              <span
                                className={`w-10 text-right pr-3 select-none shrink-0 text-[11px] ${
                                  hasError ? 'text-red-400' : hasWarning ? 'text-amber-400/60' : 'text-[#484f58]'
                                }`}
                                style={{ fontFamily: CODE_FONT }}
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
                    className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-[#e6edf3] resize-none outline-none overflow-auto"
                    spellCheck={false}
                    style={{ tabSize: 2, fontFamily: CODE_FONT, fontSize: '13px', lineHeight: '20px', padding: '0.5rem 0 0.5rem 3.5rem' }}
                  />
                )}
              </div>

              {/* Problems panel */}
              {showProblems && errors.length > 0 && (
                <div className="shrink-0 border-t border-[#30363d] bg-[#161b22] max-h-32 overflow-auto">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#21262d]">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-3 h-3 text-[#8b949e]" />
                      <span className="text-[10px] font-semibold text-[#8b949e] uppercase">Problems ({errors.length})</span>
                    </div>
                    <button onClick={() => setShowProblems(false)} className="text-[#484f58] hover:text-[#8b949e]">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="px-3 py-1 space-y-0.5">
                    {errors.slice(0, 15).map((err, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px] py-0.5" style={{ fontFamily: CODE_FONT }}>
                        <AlertTriangle className={`h-2.5 w-2.5 shrink-0 ${err.severity === 'error' ? 'text-red-400' : 'text-amber-400'}`} />
                        <span className="text-[#484f58]">Ln {err.line}</span>
                        <span className={err.severity === 'error' ? 'text-red-400' : 'text-amber-400'}>{err.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right panel: file info */}
        {rightPanelOpen && (
          <div className="w-[250px] shrink-0 border-l border-[#30363d] bg-[#0d1117] flex flex-col">
            <div className="px-3 py-2.5 border-b border-[#30363d] flex items-center justify-between">
              <span className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">File Info</span>
            </div>
            <ScrollArea className="flex-1 p-3">
              {selectedFile && fileData ? (
                <div className="space-y-3">
                  {[
                    { label: 'Name', value: fileData.name },
                    { label: 'Path', value: selectedFile },
                    { label: 'Repo', value: selectedRepo?.full_name },
                    { label: 'Language', value: language },
                    { label: 'Size', value: `${content.length.toLocaleString()} chars · ${content.split('\n').length} lines` },
                    { label: 'SHA', value: fileData.sha?.slice(0, 12) },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <span className="text-[9px] text-[#484f58] uppercase tracking-wider">{label}</span>
                      <p className="text-[11px] text-[#e6edf3] mt-0.5 break-all" style={{ fontFamily: CODE_FONT }}>{value}</p>
                    </div>
                  ))}
                  <Separator className="bg-[#21262d]" />
                  <div className="space-y-1.5">
                    <span className="text-[9px] text-[#484f58] uppercase tracking-wider">Status</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${editMode ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                      <span className="text-[11px] text-[#e6edf3]">{editMode ? 'Editing' : 'Viewing'}</span>
                    </div>
                    {hasChanges && (
                      <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                        <span className="text-[11px] text-amber-400">Unsaved</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      {errorCount > 0 ? (
                        <><span className="h-1.5 w-1.5 rounded-full bg-red-500" /><span className="text-[11px] text-red-400">{errorCount} error(s)</span></>
                      ) : (
                        <><CheckCircle2 className="h-3 w-3 text-emerald-500" /><span className="text-[11px] text-emerald-400">Clean</span></>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-[11px] text-[#484f58]">Select a file</p>
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="shrink-0 h-6 flex items-center justify-between px-3 bg-primary text-primary-foreground text-[10px]" style={{ fontFamily: CODE_FONT }}>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><GitBranch className="w-3 h-3" />{selectedRepo?.name}</span>
          {selectedFile && <span>{language}</span>}
        </div>
        <div className="flex items-center gap-3">
          {selectedFile && <span>Ln {content.split('\n').length}, Col 1</span>}
          {errorCount > 0 && <span className="text-red-200">{errorCount} errors</span>}
          {warningCount > 0 && <span className="text-amber-200">{warningCount} warnings</span>}
          <span>UTF-8</span>
        </div>
      </div>
    </div>
  );
}
