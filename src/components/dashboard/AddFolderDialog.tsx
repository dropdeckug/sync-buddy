import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Upload, FolderPlus, GitBranch, Loader2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface AddFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  repoId: string;
  repoFullName: string;
  defaultBranch?: string;
  currentPath: string; // base path inside the repo where we are adding
}

// Read a single file as base64 (without the data: prefix).
const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export const AddFolderDialog = ({
  open,
  onOpenChange,
  accountId,
  repoId,
  repoFullName,
  defaultBranch = "main",
  currentPath,
}: AddFolderDialogProps) => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"upload" | "empty" | "link">("upload");
  const [folderName, setFolderName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // Link-repo state
  const [sourceRepoFullName, setSourceRepoFullName] = useState("");
  const [sourceSubpath, setSourceSubpath] = useState("");
  const [sourceRef, setSourceRef] = useState("main");
  const [autoSync, setAutoSync] = useState(true);
  const [repoSearch, setRepoSearch] = useState("");

  const { data: ghRepos } = useQuery({
    queryKey: ["github-repos-for-link", accountId],
    enabled: open && tab === "link" && !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("github-repos", {
        body: { accountId },
      });
      if (error) throw error;
      return (data?.repos ?? []) as any[];
    },
  });

  useEffect(() => {
    if (!open) {
      setFolderName("");
      setFiles([]);
      setCommitMessage("");
      setSourceRepoFullName("");
      setSourceSubpath("");
      setSourceRef("main");
      setAutoSync(true);
      setTab("upload");
      setRepoSearch("");
    }
  }, [open]);

  const fullBasePath = () => {
    const folder = folderName.trim().replace(/^\/+|\/+$/g, "");
    const base = currentPath.replace(/^\/+|\/+$/g, "");
    return base ? `${base}/${folder}` : folder;
  };

  const handleUpload = async () => {
    if (!folderName.trim()) return toast.error("Enter a folder name");
    if (files.length === 0) return toast.error("Select a folder to upload");
    setBusy(true);
    try {
      const payload = await Promise.all(
        files.map(async (f) => {
          // webkitRelativePath gives "<chosen-folder>/sub/file.ext" — strip the
          // top-level chosen folder name so our own folder name is the root.
          const rel = (f as any).webkitRelativePath || f.name;
          const stripped = rel.includes("/") ? rel.slice(rel.indexOf("/") + 1) : rel;
          return { path: stripped, contentBase64: await readFileAsBase64(f) };
        }),
      );
      const { data, error } = await supabase.functions.invoke("github-upload-folder", {
        body: {
          accountId,
          repoFullName,
          branch: defaultBranch,
          basePath: fullBasePath(),
          files: payload,
          commitMessage: commitMessage || `Add folder ${folderName.trim()}`,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Committed ${payload.length} file(s)`);
      queryClient.invalidateQueries({ queryKey: ["repo-contents", repoId] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const handleEmpty = async () => {
    if (!folderName.trim()) return toast.error("Enter a folder name");
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("github-create-empty-folder", {
        body: { accountId, repoFullName, branch: defaultBranch, folderPath: fullBasePath() },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Folder created");
      queryClient.invalidateQueries({ queryKey: ["repo-contents", repoId] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to create folder");
    } finally {
      setBusy(false);
    }
  };

  const handleLink = async () => {
    if (!folderName.trim()) return toast.error("Enter a folder name");
    if (!sourceRepoFullName) return toast.error("Pick a source repository");
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("link-folder", {
        body: {
          accountId,
          destRepoId: repoId,
          destPath: fullBasePath(),
          sourceRepoFullName,
          sourceSubpath,
          sourceRef,
          autoSync,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Folder linked${autoSync ? " — auto-sync enabled" : ""}`);
      queryClient.invalidateQueries({ queryKey: ["repo-contents", repoId] });
      queryClient.invalidateQueries({ queryKey: ["linked-folders", repoId] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to link folder");
    } finally {
      setBusy(false);
    }
  };

  const filteredRepos = (ghRepos ?? []).filter((r) =>
    r.full_name?.toLowerCase().includes(repoSearch.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5" /> Add folder to {repoFullName}
          </DialogTitle>
          <DialogDescription>
            Create a folder in <code>{currentPath || "/"}</code>. Choose its source.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Folder name</Label>
          <Input
            placeholder="my-new-folder"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
          />
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="upload"><Upload className="w-4 h-4 mr-1.5" /> Upload</TabsTrigger>
            <TabsTrigger value="empty"><FolderPlus className="w-4 h-4 mr-1.5" /> Empty</TabsTrigger>
            <TabsTrigger value="link"><GitBranch className="w-4 h-4 mr-1.5" /> Link repo</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-3 pt-4">
            <Label>Pick a folder from your computer</Label>
            <Input
              type="file"
              // @ts-expect-error – non-standard but widely supported
              webkitdirectory=""
              directory=""
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
            {files.length > 0 && (
              <div className="space-y-1">
                <Badge variant="secondary">{files.length} files</Badge>
                <ScrollArea className="h-32 rounded-md border p-2">
                  {files.slice(0, 50).map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                      <FileText className="w-3 h-3" />
                      <span className="truncate">{(f as any).webkitRelativePath || f.name}</span>
                    </div>
                  ))}
                  {files.length > 50 && (
                    <div className="text-xs text-muted-foreground pt-1">
                      + {files.length - 50} more…
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}
            <Label>Commit message</Label>
            <Input
              placeholder={`Add folder ${folderName || "<name>"}`}
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
            />
          </TabsContent>

          <TabsContent value="empty" className="pt-4">
            <p className="text-sm text-muted-foreground">
              Creates <code>{fullBasePath() || "<folder>"}/.gitkeep</code> so the empty folder
              is committed.
            </p>
          </TabsContent>

          <TabsContent value="link" className="space-y-3 pt-4">
            <Label>Source repository</Label>
            <Input
              placeholder="Search your repos..."
              value={repoSearch}
              onChange={(e) => setRepoSearch(e.target.value)}
            />
            <ScrollArea className="h-40 rounded-md border">
              <div className="p-1">
                {filteredRepos.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSourceRepoFullName(r.full_name)}
                    className={`w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-muted ${
                      sourceRepoFullName === r.full_name ? "bg-primary/10" : ""
                    }`}
                  >
                    {r.full_name}
                  </button>
                ))}
                {filteredRepos.length === 0 && (
                  <p className="text-xs text-muted-foreground p-3">No repos found.</p>
                )}
              </div>
            </ScrollArea>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sub-path (optional)</Label>
                <Input
                  placeholder="src/components"
                  value={sourceSubpath}
                  onChange={(e) => setSourceSubpath(e.target.value)}
                />
              </div>
              <div>
                <Label>Branch</Label>
                <Input value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm">Auto-sync on push</Label>
                <p className="text-xs text-muted-foreground">
                  When the source repo gets new commits in this folder, mirror them here.
                </p>
              </div>
              <Switch checked={autoSync} onCheckedChange={setAutoSync} />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={tab === "upload" ? handleUpload : tab === "empty" ? handleEmpty : handleLink}
            disabled={busy}
          >
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {tab === "upload" ? "Upload & Commit" : tab === "empty" ? "Create folder" : "Link & Sync"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddFolderDialog;
