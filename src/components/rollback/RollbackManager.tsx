import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RotateCcw, GitCommit, Clock, Loader2, CheckCircle, History } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface SyncSnapshot {
  id: string;
  sync_group_id: string;
  sync_history_id: string | null;
  repo_full_name: string;
  commit_sha: string;
  files_snapshot: any;
  created_at: string;
}

interface SyncHistory {
  id: string;
  repo_full_name: string;
  commit_sha: string | null;
  commit_message: string | null;
  status: string;
  synced_at: string;
}

interface RollbackManagerProps {
  syncGroupId: string;
  accessToken: string;
}

export function RollbackManager({ syncGroupId, accessToken }: RollbackManagerProps) {
  const [snapshots, setSnapshots] = useState<SyncSnapshot[]>([]);
  const [history, setHistory] = useState<SyncHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRollingBack, setIsRollingBack] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, [syncGroupId]);

  const fetchData = async () => {
    try {
      const [snapshotsRes, historyRes] = await Promise.all([
        supabase
          .from("sync_snapshots")
          .select("*")
          .eq("sync_group_id", syncGroupId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("sync_history")
          .select("*")
          .order("synced_at", { ascending: false })
          .limit(50),
      ]);

      if (snapshotsRes.error) throw snapshotsRes.error;
      if (historyRes.error) throw historyRes.error;

      setSnapshots(snapshotsRes.data || []);
      setHistory(historyRes.data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching rollback data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const performRollback = async (snapshot: SyncSnapshot) => {
    setIsRollingBack(snapshot.id);
    try {
      const { error } = await supabase.functions.invoke("rollback-sync", {
        body: {
          syncGroupId,
          snapshotId: snapshot.id,
          repoFullName: snapshot.repo_full_name,
          targetCommitSha: snapshot.commit_sha,
          accessToken,
        },
      });

      if (error) throw error;

      toast({
        title: "Rollback initiated",
        description: `Rolling back ${snapshot.repo_full_name} to ${snapshot.commit_sha.substring(0, 7)}`,
      });

      // Refresh data
      await fetchData();
    } catch (error: any) {
      toast({
        title: "Rollback failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsRollingBack(null);
    }
  };

  // Group snapshots by repository
  const snapshotsByRepo = snapshots.reduce((acc, snapshot) => {
    if (!acc[snapshot.repo_full_name]) {
      acc[snapshot.repo_full_name] = [];
    }
    acc[snapshot.repo_full_name].push(snapshot);
    return acc;
  }, {} as Record<string, SyncSnapshot[]>);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <RotateCcw className="h-6 w-6" />
          Rollback Manager
        </h2>
        <p className="text-muted-foreground">
          Restore repositories to previous sync states
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Available Snapshots</p>
                <p className="text-3xl font-bold">{snapshots.length}</p>
              </div>
              <History className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Repositories</p>
                <p className="text-3xl font-bold">{Object.keys(snapshotsByRepo).length}</p>
              </div>
              <GitCommit className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Snapshots by Repository */}
      {Object.keys(snapshotsByRepo).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <History className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No snapshots available</h3>
            <p className="text-muted-foreground text-center">
              Snapshots are created automatically during sync operations.
              Run a sync to create your first snapshot.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(snapshotsByRepo).map(([repoName, repoSnapshots]) => (
            <Card key={repoName}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <GitCommit className="h-5 w-5" />
                  {repoName}
                </CardTitle>
                <CardDescription>
                  {repoSnapshots.length} snapshot{repoSnapshots.length !== 1 ? "s" : ""} available
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[250px]">
                  <div className="space-y-3">
                    {repoSnapshots.map((snapshot, index) => (
                      <div
                        key={snapshot.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                            <Clock className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                                {snapshot.commit_sha.substring(0, 7)}
                              </code>
                              {index === 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  Latest
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(snapshot.created_at), "MMM d, yyyy 'at' h:mm a")}
                              <span className="mx-1">•</span>
                              {formatDistanceToNow(new Date(snapshot.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isRollingBack === snapshot.id || index === 0}
                            >
                              {isRollingBack === snapshot.id ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <RotateCcw className="h-4 w-4 mr-2" />
                              )}
                              Rollback
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Confirm Rollback</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will restore <strong>{repoName}</strong> to commit{" "}
                                <code className="bg-muted px-1 rounded">
                                  {snapshot.commit_sha.substring(0, 7)}
                                </code>{" "}
                                from {format(new Date(snapshot.created_at), "MMMM d, yyyy")}.
                                <br /><br />
                                This action will create a new commit reverting the changes.
                                Make sure you have a backup or can re-sync if needed.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => performRollback(snapshot)}>
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Confirm Rollback
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Recent Sync History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Recent Sync History
          </CardTitle>
          <CardDescription>
            Reference for rollback decisions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
              {history.slice(0, 10).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle
                      className={`h-4 w-4 ${
                        entry.status === "success" ? "text-green-500" : "text-red-500"
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium">{entry.repo_full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.commit_message || "No message"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {entry.commit_sha && (
                      <code className="text-xs font-mono text-muted-foreground">
                        {entry.commit_sha.substring(0, 7)}
                      </code>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(entry.synced_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
