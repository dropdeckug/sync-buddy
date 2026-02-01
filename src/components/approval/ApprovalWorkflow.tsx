import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Clock, CheckCircle, XCircle, AlertCircle, GitBranch, Loader2, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SyncApproval {
  id: string;
  sync_group_id: string;
  requested_by: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  reviewed_by: string | null;
  review_comment: string | null;
  files_to_sync: any;
  source_repo: string;
  target_repos: any;
  expires_at: string;
  created_at: string;
  reviewed_at: string | null;
}

interface ApprovalWorkflowProps {
  syncGroupId?: string;
}

const statusConfig = {
  pending: {
    icon: Clock,
    color: "bg-yellow-500/20 text-yellow-500",
    label: "Pending Review",
  },
  approved: {
    icon: CheckCircle,
    color: "bg-green-500/20 text-green-500",
    label: "Approved",
  },
  rejected: {
    icon: XCircle,
    color: "bg-red-500/20 text-red-500",
    label: "Rejected",
  },
  expired: {
    icon: AlertCircle,
    color: "bg-gray-500/20 text-gray-500",
    label: "Expired",
  },
};

export function ApprovalWorkflow({ syncGroupId }: ApprovalWorkflowProps) {
  const [approvals, setApprovals] = useState<SyncApproval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedApproval, setSelectedApproval] = useState<SyncApproval | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchApprovals();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('sync_approvals')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sync_approvals',
          filter: syncGroupId ? `sync_group_id=eq.${syncGroupId}` : undefined,
        },
        () => {
          fetchApprovals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [syncGroupId]);

  const fetchApprovals = async () => {
    try {
      let query = supabase
        .from("sync_approvals")
        .select("*")
        .order("created_at", { ascending: false });

      if (syncGroupId) {
        query = query.eq("sync_group_id", syncGroupId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setApprovals(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching approvals",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const reviewApproval = async (approval: SyncApproval, decision: 'approved' | 'rejected') => {
    setIsReviewing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("sync_approvals")
        .update({
          status: decision,
          reviewed_by: user.id,
          review_comment: reviewComment || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", approval.id);

      if (error) throw error;

      // If approved, trigger the sync
      if (decision === 'approved') {
        await supabase.functions.invoke("sync-repos", {
          body: {
            syncGroupId: approval.sync_group_id,
            approvalId: approval.id,
          },
        });
      }

      setSelectedApproval(null);
      setReviewComment("");

      toast({
        title: `Sync ${decision}`,
        description: decision === 'approved'
          ? "The sync will begin shortly."
          : "The sync request has been rejected.",
      });
    } catch (error: any) {
      toast({
        title: "Error reviewing approval",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsReviewing(false);
    }
  };

  const pendingApprovals = approvals.filter(a => a.status === 'pending');
  const reviewedApprovals = approvals.filter(a => a.status !== 'pending');

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
        <h2 className="text-2xl font-bold">Approval Queue</h2>
        <p className="text-muted-foreground">
          Review and approve sync requests before they execute
        </p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending
            {pendingApprovals.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {pendingApprovals.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4 mt-4">
          {pendingApprovals.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                <h3 className="text-lg font-medium mb-2">No pending approvals</h3>
                <p className="text-muted-foreground text-center">
                  All sync requests have been reviewed
                </p>
              </CardContent>
            </Card>
          ) : (
            pendingApprovals.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                onReview={() => setSelectedApproval(approval)}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="reviewed" className="space-y-4 mt-4">
          {reviewedApprovals.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No reviewed approvals</h3>
                <p className="text-muted-foreground text-center">
                  Reviewed approvals will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            reviewedApprovals.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                showReviewInfo
              />
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={!!selectedApproval} onOpenChange={() => setSelectedApproval(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Sync Request</DialogTitle>
            <DialogDescription>
              Review the sync details and approve or reject this request
            </DialogDescription>
          </DialogHeader>
          {selectedApproval && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Source Repository</p>
                  <p className="font-medium">{selectedApproval.source_repo}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Target Repositories</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Array.isArray(selectedApproval.target_repos) &&
                      selectedApproval.target_repos.map((repo: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {repo}
                        </Badge>
                      ))}
                  </div>
                </div>
              </div>

              {selectedApproval.files_to_sync && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Files to Sync</p>
                  <div className="max-h-32 overflow-y-auto bg-muted rounded-lg p-3">
                    {Array.isArray(selectedApproval.files_to_sync) ? (
                      selectedApproval.files_to_sync.map((file: string, i: number) => (
                        <p key={i} className="text-xs font-mono">{file}</p>
                      ))
                    ) : (
                      <p className="text-xs">All files from source</p>
                    )}
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm text-muted-foreground mb-2">Review Comment (optional)</p>
                <Textarea
                  placeholder="Add a comment for this review..."
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSelectedApproval(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedApproval && reviewApproval(selectedApproval, 'rejected')}
              disabled={isReviewing}
            >
              {isReviewing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </Button>
            <Button
              onClick={() => selectedApproval && reviewApproval(selectedApproval, 'approved')}
              disabled={isReviewing}
            >
              {isReviewing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <CheckCircle className="h-4 w-4 mr-2" />
              Approve & Sync
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ApprovalCard({
  approval,
  onReview,
  showReviewInfo,
}: {
  approval: SyncApproval;
  onReview?: () => void;
  showReviewInfo?: boolean;
}) {
  const config = statusConfig[approval.status];
  const StatusIcon = config.icon;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${config.color}`}>
              <StatusIcon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                {approval.source_repo}
              </CardTitle>
              <CardDescription>
                Requested {formatDistanceToNow(new Date(approval.created_at), { addSuffix: true })}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={config.color}>
              {config.label}
            </Badge>
            {approval.status === 'pending' && onReview && (
              <Button onClick={onReview}>
                Review
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {Array.isArray(approval.target_repos) &&
            approval.target_repos.map((repo: string, i: number) => (
              <Badge key={i} variant="outline">
                → {repo}
              </Badge>
            ))}
        </div>
        {showReviewInfo && approval.reviewed_at && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Reviewed {formatDistanceToNow(new Date(approval.reviewed_at), { addSuffix: true })}
            </p>
            {approval.review_comment && (
              <p className="text-sm mt-1 italic">"{approval.review_comment}"</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
