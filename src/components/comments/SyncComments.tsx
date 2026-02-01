import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Send, Loader2, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SyncComment {
  id: string;
  sync_group_id: string | null;
  sync_history_id: string | null;
  user_id: string;
  content: string;
  mentioned_users: string[] | null;
  created_at: string;
  updated_at: string;
}

interface SyncCommentsProps {
  syncGroupId?: string;
  syncHistoryId?: string;
}

export function SyncComments({ syncGroupId, syncHistoryId }: SyncCommentsProps) {
  const [comments, setComments] = useState<SyncComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchComments();
    getCurrentUser();
  }, [syncGroupId, syncHistoryId]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);
  };

  const fetchComments = async () => {
    try {
      let query = supabase
        .from("sync_comments")
        .select("*")
        .order("created_at", { ascending: true });

      if (syncGroupId) {
        query = query.eq("sync_group_id", syncGroupId);
      }
      if (syncHistoryId) {
        query = query.eq("sync_history_id", syncHistoryId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setComments(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching comments",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const postComment = async () => {
    if (!newComment.trim()) return;

    setIsPosting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("sync_comments")
        .insert({
          sync_group_id: syncGroupId || null,
          sync_history_id: syncHistoryId || null,
          user_id: user.id,
          content: newComment,
        })
        .select()
        .single();

      if (error) throw error;

      setComments(prev => [...prev, data]);
      setNewComment("");
    } catch (error: any) {
      toast({
        title: "Error posting comment",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsPosting(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      const { error } = await supabase
        .from("sync_comments")
        .delete()
        .eq("id", commentId);

      if (error) throw error;

      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (error: any) {
      toast({
        title: "Error deleting comment",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      postComment();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Comments ({comments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {comments.length > 0 && (
          <ScrollArea className="h-[200px] pr-4">
            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      U
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                      </span>
                      {comment.user_id === currentUserId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => deleteComment(comment.id)}
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </Button>
                      )}
                    </div>
                    <p className="text-sm mt-1">{comment.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="flex gap-2">
          <Textarea
            placeholder="Add a comment... (Ctrl+Enter to post)"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            className="resize-none"
          />
          <Button
            onClick={postComment}
            disabled={isPosting || !newComment.trim()}
            size="icon"
            className="shrink-0"
          >
            {isPosting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
