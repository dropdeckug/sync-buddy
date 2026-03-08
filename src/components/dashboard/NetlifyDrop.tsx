import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload, FolderArchive, FileText, X, Rocket, CheckCircle2, ExternalLink, Loader2, AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface NetlifyDropProps {
  accountId: string;
}

type DeployState = "idle" | "uploading" | "creating" | "pushing" | "done" | "error";

const NetlifyDrop = ({ accountId }: NetlifyDropProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<{ path: string; content: string; size: number }[]>([]);
  const [repoName, setRepoName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [deployState, setDeployState] = useState<DeployState>("idle");
  const [progress, setProgress] = useState(0);
  const [createdRepo, setCreatedRepo] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const processFiles = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB per file
    const processed: { path: string; content: string; size: number }[] = [];

    for (const file of arr) {
      if (file.size > MAX_SIZE) {
        toast.error(`${file.name} exceeds 10MB limit, skipped`);
        continue;
      }
      // Use webkitRelativePath if available, otherwise just name
      const path = (file as any).webkitRelativePath || file.name;
      const content = await readFileAsBase64(file);
      processed.push({ path, content, size: file.size });
    }

    setFiles(processed);
    if (processed.length > 0) {
      // Auto-suggest repo name from folder or first file
      const firstPath = processed[0].path;
      const suggested = firstPath.includes("/") ? firstPath.split("/")[0] : firstPath.replace(/\.[^/.]+$/, "");
      if (!repoName) setRepoName(suggested.toLowerCase().replace(/[^a-z0-9-_]/g, "-"));
    }
    toast.success(`${processed.length} file(s) ready`);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const items = e.dataTransfer.items;
    const allFiles: File[] = [];

    // Try to read directory entries
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
        for (const entry of entries) {
          await readEntries(entry);
        }
        await processFiles(allFiles);
        return;
      }
    }

    // Fallback: regular file drop
    await processFiles(Array.from(e.dataTransfer.files));
  }, [repoName]);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(e.target.files);
    }
  };

  const handleDeploy = async () => {
    if (!repoName.trim()) {
      toast.error("Please enter a repository name");
      return;
    }
    if (files.length === 0) {
      toast.error("Please add files first");
      return;
    }

    setDeployState("uploading");
    setProgress(10);
    setErrorMsg("");

    try {
      setDeployState("creating");
      setProgress(30);

      const { data, error } = await supabase.functions.invoke("github-create-repo", {
        body: {
          accountId,
          repoName: repoName.trim(),
          description: description.trim(),
          isPrivate,
          files: files.map((f) => ({ path: f.path, content: f.content })),
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setProgress(90);
      setDeployState("pushing");

      await new Promise((r) => setTimeout(r, 500));
      setProgress(100);
      setDeployState("done");
      setCreatedRepo(data.repo);

      toast.success(`Repository "${data.repo.full_name}" created with ${data.filesUploaded} files!`);
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
    setCreatedRepo(null);
    setErrorMsg("");
  };

  const totalSize = files.reduce((a, f) => a + f.size, 0);

  // Success state
  if (deployState === "done" && createdRepo) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center animate-in zoom-in duration-300">
          <CheckCircle2 className="w-10 h-10 text-primary" />
        </div>
        <div className="space-y-2">
          <h3 className="text-2xl font-bold">Deployed Successfully!</h3>
          <p className="text-muted-foreground">
            Your files are live at <span className="text-primary font-semibold">{createdRepo.full_name}</span>
          </p>
        </div>
        <div className="flex gap-3">
          <Button asChild>
            <a href={createdRepo.html_url} target="_blank" rel="noopener noreferrer" className="gap-2">
              <ExternalLink className="w-4 h-4" />
              View on GitHub
            </a>
          </Button>
          <Button variant="outline" onClick={resetDrop}>
            Deploy Another
          </Button>
        </div>
      </div>
    );
  }

  // Deploying state
  if (deployState !== "idle" && deployState !== "error") {
    const stateMessages = {
      uploading: "Preparing files...",
      creating: "Creating repository...",
      pushing: "Pushing files to GitHub...",
      done: "Done!",
      error: "Error",
    };

    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <div className="text-center space-y-2">
          <h3 className="text-xl font-bold">{stateMessages[deployState]}</h3>
          <p className="text-sm text-muted-foreground">
            {files.length} files • {repoName}
          </p>
        </div>
        <Progress value={progress} className="w-64" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => files.length === 0 && fileInputRef.current?.click()}
        className={`relative flex-1 min-h-[240px] border-2 border-dashed rounded-2xl m-4 mb-2 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-300 ${
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : files.length > 0
            ? "border-primary/30 bg-primary/5"
            : "border-border hover:border-primary/40 hover:bg-muted/20"
        } ${deployState === "error" ? "border-destructive/50 bg-destructive/5" : ""}`}
      >
        {files.length === 0 ? (
          <>
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center transition-colors ${
              isDragging ? "bg-primary/20" : "bg-muted/30"
            }`}>
              <FolderArchive className={`w-10 h-10 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <div className="text-center space-y-1">
              <p className="text-lg font-semibold">
                {isDragging ? "Drop to upload" : "Drag & drop your site folder here"}
              </p>
              <p className="text-sm text-muted-foreground">
                or click to browse • supports folders, files & zips
              </p>
            </div>
          </>
        ) : (
          <div className="w-full p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <FileText className="w-3 h-3" />
                  {files.length} files
                </Badge>
                <Badge variant="outline">
                  {(totalSize / 1024).toFixed(0)} KB
                </Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setFiles([]); }}>
                <X className="w-4 h-4 mr-1" /> Clear
              </Button>
            </div>
            <ScrollArea className="h-32">
              <div className="space-y-1 pr-3">
                {files.slice(0, 50).map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-muted/30">
                    <FileText className="w-3 h-3 text-primary shrink-0" />
                    <span className="truncate text-foreground/80">{f.path}</span>
                    <span className="ml-auto text-muted-foreground shrink-0">
                      {(f.size / 1024).toFixed(1)}K
                    </span>
                  </div>
                ))}
                {files.length > 50 && (
                  <p className="text-xs text-muted-foreground text-center py-1">
                    ...and {files.length - 50} more files
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInput}
          className="hidden"
          {...({ webkitdirectory: "", directory: "" } as any)}
        />
      </div>

      {deployState === "error" && (
        <div className="mx-4 mb-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-destructive">Deploy failed</p>
            <p className="text-destructive/80 text-xs">{errorMsg}</p>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto shrink-0" onClick={() => setDeployState("idle")}>
            Retry
          </Button>
        </div>
      )}

      {/* Config */}
      <div className="p-4 pt-2 space-y-3 border-t border-border/30">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Repository Name *</Label>
            <Input
              placeholder="my-awesome-site"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, "-"))}
              className="h-9 bg-muted/20 border-border/30"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Description</Label>
            <Input
              placeholder="My project"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-9 bg-muted/20 border-border/30"
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
            <Label className="text-xs text-muted-foreground">Private repository</Label>
          </div>
          <Button
            onClick={handleDeploy}
            disabled={files.length === 0 || !repoName.trim()}
            className="gap-2 rounded-xl font-semibold"
          >
            <Rocket className="w-4 h-4" />
            Deploy to GitHub
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NetlifyDrop;
