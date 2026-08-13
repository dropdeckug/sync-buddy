import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface FailedSyncsProps {
  accountId: string;
  /** Limit to a single project/sync group. */
  syncGroupId?: string;
}

interface FailedRow {
  id: string;
  sync_group_id: string;
  target_repo_full_name: string;
  target_repo_name: string;
  source_repo_full_name: string;
  error_message: string | null;
  files_processed: number | null;
  total_files: number | null;
  updated_at: string;
}

export const FailedSyncs = ({ accountId, syncGroupId }: FailedSyncsProps) => {
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["failed-syncs", accountId, syncGroupId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("sync_progress")
        .select("*")
        .eq("account_id", accountId)
        .eq("status", "failed")
        .order("updated_at", { ascending: false })
        .limit(25);
      if (syncGroupId) q = q.eq("sync_group_id", syncGroupId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as FailedRow[];
    },
    refetchInterval: 15000,
  });

  const retry = async (targets: FailedRow[], key: string) => {
    setRetrying(key);
    try {
      const fullNames = Array.from(new Set(targets.map((t) => t.target_repo_full_name)));
      const { data: repos, error } = await supabase
        .from("repos")
        .select("id, full_name")
        .in("full_name", fullNames);
      if (error) throw error;
      const ids = (repos ?? []).map((r) => r.id);
      if (ids.length === 0) throw new Error("Could not resolve the repositories to retry");

      const { error: fnError } = await supabase.functions.invoke("sync-repos", {
        body: { syncGroupId: targets[0].sync_group_id, accountId, targetRepoIds: ids },
      });
      if (fnError) throw fnError;

      // Mark the rows as re-queued so the list reflects the retry immediately.
      await supabase
        .from("sync_progress")
        .update({ status: "syncing", error_message: null })
        .in("id", targets.map((t) => t.id));

      toast.success(
        `Resuming sync for ${ids.length} ${ids.length === 1 ? "repository" : "repositories"}`,
        { description: "Files that are already up to date are skipped." },
      );
      queryClient.invalidateQueries({ queryKey: ["failed-syncs"] });
      queryClient.invalidateQueries({ queryKey: ["sync-history"] });
    } catch (e: any) {
      toast.error("Retry failed", { description: e?.message || "Unknown error" });
    } finally {
      setRetrying(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="w-4 h-4 text-destructive" />
            Failed syncs
          </CardTitle>
          <CardDescription className="text-xs mt-1">
            Retry picks up where it stopped — unchanged files are skipped.
          </CardDescription>
        </div>
        {rows && rows.length > 1 && (
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl shrink-0"
            disabled={retrying !== null}
            onClick={() => retry(rows, "all")}
          >
            {retrying === "all" ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            )}
            Retry all
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Checking for failed syncs…</p>
        ) : rows && rows.length > 0 ? (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.id} className="p-3 rounded-xl border border-destructive/25 bg-destructive/5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{row.target_repo_name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      from {row.source_repo_full_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="destructive" className="text-[10px] h-5">failed</Badge>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 rounded-lg text-xs"
                      disabled={retrying !== null}
                      onClick={() => retry([row], row.id)}
                    >
                      {retrying === row.id ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3 mr-1" />
                      )}
                      Retry
                    </Button>
                  </div>
                </div>
                {row.error_message && (
                  <p className="text-[10px] text-destructive mt-2 break-words">{row.error_message}</p>
                )}
                <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                  {(row.total_files ?? 0) > 0 && (
                    <span>
                      stopped at {row.files_processed ?? 0}/{row.total_files} files
                    </span>
                  )}
                  <span className="ml-auto">
                    {formatDistanceToNow(new Date(row.updated_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            No failed syncs.
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FailedSyncs;
