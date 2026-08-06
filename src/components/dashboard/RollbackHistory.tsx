import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { Undo2, History, Loader2, GitCommit, FileDiff, Crown, AlertTriangle } from "lucide-react";

interface RollbackHistoryProps {
  accountId: string;
  /** When provided, only snapshots for this sync group are listed. */
  syncGroupId?: string;
}

interface DiffFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

interface RepoDiff {
  repo_full_name: string;
  before_sha?: string;
  after_sha?: string;
  note?: string;
  error?: string;
  stats?: { additions: number; deletions: number };
  commits: { sha: string; message: string; author: string; date: string }[];
  files: DiffFile[];
}

const PatchView = ({ patch }: { patch: string }) => (
  <pre className="text-[11px] leading-relaxed font-mono overflow-x-auto rounded-lg bg-muted/30 p-3">
    {patch.split("\n").map((line, i) => {
      const cls = line.startsWith("+")
        ? "text-accent"
        : line.startsWith("-")
        ? "text-destructive"
        : line.startsWith("@@")
        ? "text-primary"
        : "text-muted-foreground";
      return (
        <div key={i} className={cls}>
          {line || " "}
        </div>
      );
    })}
  </pre>
);

export const RollbackHistory = ({ accountId, syncGroupId }: RollbackHistoryProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffs, setDiffs] = useState<RepoDiff[]>([]);
  const [diffTitle, setDiffTitle] = useState("");

  const { data: snapshots, isLoading } = useQuery({
    queryKey: ["sync-snapshots", accountId, syncGroupId ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("sync_snapshots")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (syncGroupId) query = query.eq("sync_group_id", syncGroupId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!accountId,
  });

  const viewDiff = async (snapshotId: string, summary: string) => {
    setDiffTitle(summary);
    setDiffs([]);
    setDiffOpen(true);
    setDiffLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("rollback-sync", {
        body: { action: "diff", snapshotId },
      });
      if (error) throw error;
      setDiffs(data?.diffs || []);
    } catch (err: any) {
      toast({ title: "Could not load changes", description: err.message, variant: "destructive" });
    } finally {
      setDiffLoading(false);
    }
  };

  const rollback = async (snapshotId: string) => {
    setRollingBackId(snapshotId);
    setConfirmId(null);
    try {
      const { data, error } = await supabase.functions.invoke("rollback-sync", {
        body: { action: "rollback", snapshotId },
      });
      if (error) throw error;

      const failed = (data?.results || []).filter((r: any) => !r.success);
      if (failed.length > 0) {
        toast({
          title: "Rollback partially completed",
          description: `${failed.length} repository(ies) could not be restored: ${failed.map((f: any) => f.repo).join(", ")}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Rollback complete",
          description: "All repositories were restored to the state before this sync.",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["sync-snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["sync-history"] });
      queryClient.invalidateQueries({ queryKey: ["sync-group"] });
      queryClient.invalidateQueries({ queryKey: ["sync-groups"] });
    } catch (err: any) {
      toast({ title: "Rollback failed", description: err.message, variant: "destructive" });
    } finally {
      setRollingBackId(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Undo2 className="w-5 h-5" />
            Restore Points
          </CardTitle>
          <CardDescription>
            Every sync is snapshotted. Roll back to undo a sync across the mother and all child repositories.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading restore points...</div>
          ) : snapshots && snapshots.length > 0 ? (
            <div className="space-y-3">
              {snapshots.map((snap: any) => {
                const entries = (snap.entries || []) as any[];
                const targets = entries.filter((e) => e.role === "target");
                return (
                  <div
                    key={snap.id}
                    className="p-4 rounded-lg border border-border hover:border-primary/50 transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Crown className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="text-sm font-medium truncate">{snap.source_repo_full_name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 break-words">{snap.summary}</p>
                      </div>
                      {snap.rolled_back_at ? (
                        <Badge variant="secondary" className="shrink-0">Rolled back</Badge>
                      ) : (
                        <Badge variant="outline" className="shrink-0">{targets.length} repo(s)</Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <GitCommit className="w-3 h-3" />
                      <span className="font-mono">{snap.source_commit_sha?.substring(0, 7)}</span>
                      <span className="ml-auto">
                        {formatDistanceToNow(new Date(snap.created_at), { addSuffix: true })}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => viewDiff(snap.id, snap.summary)}
                      >
                        <FileDiff className="w-3.5 h-3.5" /> View changes
                      </Button>
                      <Button
                        size="sm"
                        variant={snap.rolled_back_at ? "outline" : "default"}
                        className="gap-2"
                        disabled={rollingBackId === snap.id}
                        onClick={() => setConfirmId(snap.id)}
                      >
                        {rollingBackId === snap.id ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Rolling back...</>
                        ) : (
                          <><Undo2 className="w-3.5 h-3.5" /> Roll back to this</>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 space-y-4">
              <History className="w-16 h-16 mx-auto text-muted-foreground" />
              <div>
                <p className="text-muted-foreground">No restore points yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  A restore point is created automatically before each sync
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diff viewer */}
      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDiff className="w-4 h-4" /> Changes in this sync
            </DialogTitle>
            <DialogDescription className="break-words">{diffTitle}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 pr-3">
            {diffLoading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading diff...
              </div>
            ) : diffs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No changes to show.</p>
            ) : (
              <div className="space-y-6">
                {diffs.map((d) => (
                  <div key={d.repo_full_name} className="space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{d.repo_full_name}</span>
                      {d.stats && (
                        <span className="text-xs">
                          <span className="text-accent">+{d.stats.additions}</span>{" "}
                          <span className="text-destructive">-{d.stats.deletions}</span>
                        </span>
                      )}
                    </div>
                    {d.note && <p className="text-xs text-muted-foreground">{d.note}</p>}
                    {d.error && <p className="text-xs text-destructive break-all">{d.error}</p>}

                    {d.commits.length > 0 && (
                      <div className="space-y-1">
                        {d.commits.map((c) => (
                          <div key={c.sha} className="text-xs text-muted-foreground flex gap-2">
                            <span className="font-mono text-primary">{c.sha.substring(0, 7)}</span>
                            <span className="truncate">{c.message?.split("\n")[0]}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-2">
                      {d.files.map((f) => (
                        <div key={f.filename} className="rounded-lg border border-border p-3 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{f.status}</Badge>
                            <span className="text-xs font-mono break-all">{f.filename}</span>
                            <span className="text-[10px] ml-auto">
                              <span className="text-accent">+{f.additions}</span>{" "}
                              <span className="text-destructive">-{f.deletions}</span>
                            </span>
                          </div>
                          {f.patch ? (
                            <PatchView patch={f.patch} />
                          ) : (
                            <p className="text-[10px] text-muted-foreground">Binary or too large to display</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Confirm rollback */}
      <AlertDialog open={!!confirmId} onOpenChange={(open) => !open && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" /> Roll back this sync?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every repository touched by this sync will be force-reset to the exact commit it was on
              before the sync, and the mother repository in charge at that time is restored. This
              rewrites branch history on GitHub and cannot be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmId && rollback(confirmId)}>
              Roll back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default RollbackHistory;
