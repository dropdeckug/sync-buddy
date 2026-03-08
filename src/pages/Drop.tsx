import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload, FolderArchive, FileText, X, Rocket, CheckCircle2,
  ExternalLink, Loader2, AlertCircle, ArrowLeft, Lock, Globe, Folder
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Session } from "@supabase/supabase-js";
import JSZip from "jszip";

type DeployState = "idle" | "reading" | "extracting" | "creating" | "done" | "error";

interface ProcessedFile {
  path: string;
  content: string;
  size: number;
}

const Drop = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [repoName, setRepoName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [deployState, setDeployState] = useState<DeployState>("idle");
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [createdRepo, setCreatedRepo] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session) fetchAccounts(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchAccounts(session.user.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchAccounts = async (userId: string) => {
    const { data } = await supabase
      .from("github_accounts")
      .select("id, github_username, avatar_url")
      .eq("user_id", userId);
    if (data && data.length > 0) {
      setAccounts(data);
      setSelectedAccountId(data[0].id);
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const extractZip = async (file: File): Promise<ProcessedFile[]> => {
    setDeployState("extracting");
    setProgressMsg("Extracting ZIP archive...");
    const zip = await JSZip.loadAsync(file);
    const extracted: ProcessedFile[] = [];
    const entries = Object.entries(zip.files).filter(
      ([p, e]) => !e.dir && !p.startsWith("__MACOSX/") && !p.includes(".DS_Store")
    );
    let i = 0;

    for (const [relativePath, zipEntry] of entries) {
      const content = await zipEntry.async("base64");
      const size = (await zipEntry.async("uint8array")).length;
      extracted.push({ path: relativePath, content, size });
      i++;
      setProgress(Math.round((i / entries.length) * 40));
      setProgressMsg(`Extracting: ${relativePath.split("/").pop()}`);
    }

    // Strip common root prefix
    if (extracted.length > 0) {
      const firstSlash = extracted[0].path.indexOf("/");
      if (firstSlash > 0) {
        const prefix = extracted[0].path.substring(0, firstSlash + 1);
        if (extracted.every((f) => f.path.startsWith(prefix))) {
          extracted.forEach((f) => (f.path = f.path.substring(prefix.length)));
        }
      }
    }

    return extracted.filter((f) => f.path.length > 0);
  };

  const processFiles = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    setDeployState("reading");
    setProgressMsg("Reading files...");
    setProgress(5);

    if (arr.length === 1 && (arr[0].name.endsWith(".zip") || arr[0].type === "application/zip")) {
      try {
        const extracted = await extractZip(arr[0]);
        setFiles(extracted);
        autoSuggestName(extracted);
        setDeployState("idle");
        setProgress(0);
        toast.success(`Extracted ${extracted.length} files from ZIP`);
        return;
      } catch {
        toast.error("Failed to extract ZIP file");
        setDeployState("idle");
        setProgress(0);
        return;
      }
    }

    const MAX_SIZE = 10 * 1024 * 1024;
    const processed: ProcessedFile[] = [];

    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      if (file.size > MAX_SIZE) { toast.error(`${file.name} exceeds 10MB, skipped`); continue; }
      if (file.name === ".DS_Store" || file.name.startsWith("__MACOSX")) continue;
      const path = (file as any).webkitRelativePath || file.name;
      const content = await readFileAsBase64(file);
      processed.push({ path, content, size: file.size });
      setProgress(Math.round(((i + 1) / arr.length) * 40));
      setProgressMsg(`Reading: ${file.name}`);
    }

    setFiles(processed);
    autoSuggestName(processed);
    setDeployState("idle");
    setProgress(0);
    if (processed.length > 0) toast.success(`${processed.length} file(s) ready`);
  };

  const autoSuggestName = (processed: ProcessedFile[]) => {
    if (processed.length > 0 && !repoName) {
      const firstPath = processed[0].path;
      const suggested = firstPath.includes("/")
        ? firstPath.split("/")[0]
        : firstPath.replace(/\.[^/.]+$/, "");
      setRepoName(suggested.toLowerCase().replace(/[^a-z0-9-_]/g, "-"));
    }
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragCounter((c) => c + 1);
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragCounter((c) => {
      const next = c - 1;
      if (next <= 0) setIsDragging(false);
      return Math.max(0, next);
    });
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setDragCounter(0);

    const items = e.dataTransfer.items;
    const allFiles: File[] = [];

    const readEntries = async (entry: any, path = ""): Promise<void> => {
      if (entry.isFile) {
        const file: File = await new Promise((resolve) => entry.file(resolve));
        const newFile = new File([file], path + file.name, { type: file.type });
        Object.defineProperty(newFile, "webkitRelativePath", { value: path + file.name });
        allFiles.push(newFile);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const entries: any[] = await new Promise((resolve) => reader.readEntries(resolve));
        for (const e of entries) {
          await readEntries(e, path + entry.name + "/");
        }
      }
    };

    if (items) {
      const entries = Array.from(items)
        .map((item: any) => item.webkitGetAsEntry?.())
        .filter(Boolean);
      if (entries.length > 0 && entries.some((e: any) => e.isDirectory)) {
        for (const entry of entries) await readEntries(entry);
        await processFiles(allFiles);
        return;
      }
    }
    await processFiles(Array.from(e.dataTransfer.files));
  }, [repoName]);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) await processFiles(e.target.files);
  };

  const handleDeploy = async () => {
    if (!selectedAccountId) { toast.error("Please select a GitHub account"); return; }
    if (!repoName.trim()) { toast.error("Please enter a repository name"); return; }
    if (files.length === 0) { toast.error("Please add files first"); return; }

    setDeployState("creating");
    setProgress(50);
    setProgressMsg("Creating repository...");
    setErrorMsg("");

    try {
      const { data, error } = await supabase.functions.invoke("github-create-repo", {
        body: {
          accountId: selectedAccountId,
          repoName: repoName.trim(),
          description: description.trim(),
          isPrivate,
          files: files.map((f) => ({ path: f.path, content: f.content })),
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setProgress(100);
      setDeployState("done");
      setCreatedRepo(data.repo);
      toast.success(`Repository "${data.repo.full_name}" created! Files uploading in background.`);
    } catch (err: any) {
      setDeployState("error");
      setErrorMsg(err.message || "Deployment failed");
      toast.error(err.message || "Deployment failed");
    }
  };

  const resetDrop = () => {
    setFiles([]);
    setRepoName("");
    setDescription("");
    setIsPrivate(false);
    setDeployState("idle");
    setProgress(0);
    setProgressMsg("");
    setCreatedRepo(null);
    setErrorMsg("");
  };

  const totalSize = files.reduce((a, f) => a + f.size, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-6">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <Lock className="w-10 h-10 text-primary" />
        </div>
        <div className="text-center space-y-2 max-w-md">
          <h1 className="text-3xl font-bold">Sign in to Deploy</h1>
          <p className="text-muted-foreground">
            Connect your GitHub account to start deploying projects instantly.
          </p>
        </div>
        <Button onClick={() => navigate("/")} size="lg" className="gap-2 rounded-xl">
          <ArrowLeft className="w-4 h-4" />
          Go to Sign In
        </Button>
      </div>
    );
  }

  // Success state
  if (deployState === "done" && createdRepo) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <DropHeader onBack={() => navigate("/")} />
        <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
            <div className="relative w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center animate-scale-in">
              <CheckCircle2 className="w-12 h-12 text-primary" />
            </div>
          </div>
          <div className="text-center space-y-3 max-w-lg">
            <h2 className="text-4xl font-bold tracking-tight">Deployed!</h2>
            <p className="text-lg text-muted-foreground">
              Your project is live at{" "}
              <span className="text-primary font-semibold">{createdRepo.full_name}</span>
            </p>
            <p className="text-sm text-muted-foreground/70 flex items-center justify-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Files are uploading in the background — safe to close this page.
            </p>
          </div>
          <div className="flex gap-4">
            <Button asChild size="lg" className="gap-2 rounded-xl">
              <a href={createdRepo.html_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" />
                View on GitHub
              </a>
            </Button>
            <Button variant="outline" size="lg" onClick={resetDrop} className="rounded-xl">
              Deploy Another
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Deploying states
  if (["reading", "extracting", "creating"].includes(deployState)) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <DropHeader onBack={() => navigate("/")} />
        <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
          <div className="relative">
            <div className="w-28 h-28 rounded-full border-4 border-primary/20 flex items-center justify-center">
              <div className="w-20 h-20 rounded-full border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Rocket className="w-8 h-8 text-primary" />
            </div>
          </div>
          <div className="text-center space-y-2 max-w-md">
            <h3 className="text-2xl font-bold">{getStateTitle(deployState)}</h3>
            <p className="text-sm text-muted-foreground animate-pulse">{progressMsg}</p>
            <p className="text-xs text-muted-foreground/60">{files.length} files • {repoName}</p>
          </div>
          <div className="w-80 space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">{progress}%</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-hidden">
      <DropHeader onBack={() => navigate("/")} />

      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 relative">
        {/* Ambient glow */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div
            className={`absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] sm:w-[800px] sm:h-[800px] rounded-full transition-all duration-1000 ease-out ${
              isDragging
                ? "bg-primary/10 scale-125"
                : "bg-primary/[0.03] scale-100"
            }`}
            style={{ filter: "blur(150px)" }}
          />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-8 max-w-2xl w-full">
          {/* Drop zone */}
          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => files.length === 0 && fileInputRef.current?.click()}
            className={`
              relative w-56 h-56 sm:w-72 sm:h-72 rounded-full flex flex-col items-center justify-center cursor-pointer
              transition-all duration-700 ease-out group
              ${isDragging ? "scale-[1.15]" : "scale-100 hover:scale-[1.03]"}
            `}
          >
            {/* Outer ring - always animating, speeds up on drag */}
            <svg className="absolute inset-0 w-full h-full drop-zone-ring" viewBox="0 0 288 288">
              <circle
                cx="144"
                cy="144"
                r="140"
                fill="none"
                stroke="url(#ringGradient)"
                strokeWidth="2"
                strokeDasharray="14 10"
                className={`transition-all duration-700 ${isDragging ? "drop-ring-fast" : "drop-ring-slow"}`}
                style={{ transformOrigin: "center" }}
              />
              <defs>
                <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={isDragging ? "1" : "0.4"} />
                  <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity={isDragging ? "0.8" : "0.15"} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={isDragging ? "1" : "0.4"} />
                </linearGradient>
              </defs>
            </svg>

            {/* Second ring - counter-rotate */}
            <svg className="absolute inset-2 w-[calc(100%-16px)] h-[calc(100%-16px)]" viewBox="0 0 272 272">
              <circle
                cx="136"
                cy="136"
                r="132"
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="1"
                strokeDasharray="6 18"
                strokeOpacity={isDragging ? "0.5" : "0.1"}
                className={`transition-all duration-700 ${isDragging ? "drop-ring-counter-fast" : "drop-ring-counter-slow"}`}
                style={{ transformOrigin: "center" }}
              />
            </svg>

            {/* Glow pulse on drag */}
            {isDragging && (
              <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse" />
            )}

            {/* Inner circle */}
            <div
              className={`
                absolute inset-6 rounded-full transition-all duration-700
                ${isDragging
                  ? "bg-primary/[0.08] border border-primary/30 shadow-[0_0_60px_hsl(var(--primary)/0.15)]"
                  : "bg-card/60 border border-border/30 group-hover:border-primary/20 group-hover:bg-card/80"
                }
              `}
            />

            {/* Content */}
            <div className="relative z-10 flex flex-col items-center gap-3">
              {files.length === 0 ? (
                <>
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-700 ${
                      isDragging
                        ? "bg-primary/20 scale-110 rotate-12"
                        : "bg-muted/30 group-hover:bg-primary/10 group-hover:scale-105"
                    }`}
                  >
                    <FolderArchive
                      className={`w-7 h-7 transition-all duration-500 ${
                        isDragging ? "text-primary" : "text-muted-foreground group-hover:text-primary/70"
                      }`}
                    />
                  </div>
                  <div className="text-center px-4">
                    <p className={`font-semibold text-sm transition-all duration-500 ${isDragging ? "text-primary" : ""}`}>
                      {isDragging ? "Release to upload" : "Drop your project"}
                    </p>
                    <button
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                      className="text-xs text-primary/70 hover:text-primary hover:underline mt-1 transition-colors"
                    >
                      or browse files
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                    <Folder className="w-6 h-6 text-primary" />
                  </div>
                  <Badge variant="secondary" className="gap-1">
                    <FileText className="w-3 h-3" />
                    {files.length} files
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatSize(totalSize)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={(e) => { e.stopPropagation(); resetDrop(); }}
                  >
                    <X className="w-3 h-3 mr-1" />
                    Clear
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Hero text with shimmer */}
          <div className="text-center space-y-3">
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">
              Drag & drop.{" "}
              <span className="shimmer-text">It's on GitHub.</span>
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto text-sm sm:text-base">
              Drop a folder or ZIP with your project files.
              We'll create a GitHub repo and push it —{" "}
              <span className="shimmer-text-subtle">even if you close this page</span>.
            </p>
          </div>

          {/* Error */}
          {deployState === "error" && (
            <div className="w-full max-w-md p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-start gap-3 animate-fade-in">
              <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-destructive text-sm">Deploy failed</p>
                <p className="text-destructive/70 text-xs mt-0.5">{errorMsg}</p>
              </div>
              <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setDeployState("idle")}>
                Retry
              </Button>
            </div>
          )}

          {/* File list */}
          {files.length > 0 && (
            <div className="w-full max-w-md animate-fade-in">
              <ScrollArea className="h-32 rounded-xl border border-border/30 bg-card/50 p-2">
                <div className="space-y-0.5">
                  {files.slice(0, 60).map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-muted/30">
                      <FileText className="w-3 h-3 text-primary shrink-0" />
                      <span className="truncate text-foreground/80">{f.path}</span>
                      <span className="ml-auto text-muted-foreground shrink-0">{formatSize(f.size)}</span>
                    </div>
                  ))}
                  {files.length > 60 && (
                    <p className="text-xs text-muted-foreground text-center py-1">
                      ...and {files.length - 60} more
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Config form */}
          {files.length > 0 && (
            <div className="w-full max-w-md space-y-4 animate-fade-in">
              {accounts.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">GitHub Account</Label>
                  <div className="flex gap-2 flex-wrap">
                    {accounts.map((acc) => (
                      <button
                        key={acc.id}
                        onClick={() => setSelectedAccountId(acc.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                          selectedAccountId === acc.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/50 hover:border-primary/30"
                        }`}
                      >
                        {acc.avatar_url && <img src={acc.avatar_url} className="w-5 h-5 rounded-full" alt="" />}
                        {acc.github_username}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Repository Name *</Label>
                  <Input
                    placeholder="my-awesome-project"
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, "-"))}
                    className="h-10 bg-card/50 border-border/30 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Description</Label>
                  <Input
                    placeholder="My project"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="h-10 bg-card/50 border-border/30 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    {isPrivate ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                    {isPrivate ? "Private" : "Public"} repository
                  </Label>
                </div>
                <Button
                  onClick={handleDeploy}
                  disabled={files.length === 0 || !repoName.trim() || !selectedAccountId}
                  size="lg"
                  className="gap-2 rounded-xl font-semibold px-8"
                >
                  <Rocket className="w-4 h-4" />
                  Deploy to GitHub
                </Button>
              </div>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInput}
          className="hidden"
          accept=".zip,*/*"
          {...({ webkitdirectory: "", directory: "" } as any)}
        />
      </div>
    </div>
  );
};

const DropHeader = ({ onBack }: { onBack: () => void }) => (
  <div className="relative z-20 flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-border/20 bg-background/80 backdrop-blur-sm">
    <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full w-8 h-8">
      <ArrowLeft className="w-4 h-4" />
    </Button>
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
        <Rocket className="w-3.5 h-3.5 text-primary" />
      </div>
      <span className="font-bold text-sm tracking-tight">GitSync Drop</span>
    </div>
  </div>
);

function getStateTitle(state: DeployState) {
  switch (state) {
    case "reading": return "Reading files...";
    case "extracting": return "Extracting ZIP...";
    case "creating": return "Creating repository...";
    default: return "Working...";
  }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default Drop;
