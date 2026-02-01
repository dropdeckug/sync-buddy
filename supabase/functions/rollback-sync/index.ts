import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RollbackRequest {
  syncGroupId: string;
  snapshotId: string;
  repoFullName: string;
  targetCommitSha: string;
  accessToken: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { syncGroupId, snapshotId, repoFullName, targetCommitSha, accessToken } = 
      await req.json() as RollbackRequest;

    if (!syncGroupId || !snapshotId || !repoFullName || !targetCommitSha || !accessToken) {
      throw new Error("Missing required parameters");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get snapshot data
    const { data: snapshot, error: snapshotError } = await supabase
      .from("sync_snapshots")
      .select("*")
      .eq("id", snapshotId)
      .single();

    if (snapshotError) throw snapshotError;

    console.log(`Rolling back ${repoFullName} to commit ${targetCommitSha}`);

    // Get current HEAD
    const headResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/refs/heads/main`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!headResponse.ok) {
      // Try 'master' branch
      const masterResponse = await fetch(
        `https://api.github.com/repos/${repoFullName}/git/refs/heads/master`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );
      
      if (!masterResponse.ok) {
        throw new Error("Could not find main or master branch");
      }
    }

    // Get the target commit
    const commitResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/commits/${targetCommitSha}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!commitResponse.ok) {
      throw new Error(`Target commit ${targetCommitSha} not found`);
    }

    const targetCommit = await commitResponse.json();

    // Create a new commit that reverts to the target state
    // First, get the tree from the target commit
    const targetTree = targetCommit.tree.sha;

    // Get current HEAD sha
    const repoResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    const repo = await repoResponse.json();
    const defaultBranch = repo.default_branch;

    const currentHeadResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/refs/heads/${defaultBranch}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    const currentHead = await currentHeadResponse.json();

    // Create a new commit with the target tree
    const newCommitResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/commits`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Rollback to commit ${targetCommitSha.substring(0, 7)}\n\nReverted by sync tool`,
          tree: targetTree,
          parents: [currentHead.object.sha],
        }),
      }
    );

    if (!newCommitResponse.ok) {
      const error = await newCommitResponse.text();
      throw new Error(`Failed to create rollback commit: ${error}`);
    }

    const newCommit = await newCommitResponse.json();

    // Update the branch to point to the new commit
    const updateRefResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/refs/heads/${defaultBranch}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sha: newCommit.sha,
          force: false,
        }),
      }
    );

    if (!updateRefResponse.ok) {
      const error = await updateRefResponse.text();
      throw new Error(`Failed to update branch: ${error}`);
    }

    // Create a new snapshot for the current state (before rollback is used)
    await supabase.from("sync_snapshots").insert({
      sync_group_id: syncGroupId,
      repo_full_name: repoFullName,
      commit_sha: newCommit.sha,
    });

    // Log audit entry
    await supabase.from("audit_logs").insert({
      action: "rollback_performed",
      resource_type: "repository",
      resource_id: repoFullName,
      resource_name: repoFullName,
      details: {
        from_commit: currentHead.object.sha,
        to_commit: targetCommitSha,
        new_commit: newCommit.sha,
        snapshot_id: snapshotId,
      },
    });

    // Log to activity feed
    await supabase.from("activity_feed").insert({
      activity_type: "rollback_completed",
      title: `Rollback completed for ${repoFullName}`,
      description: `Reverted to commit ${targetCommitSha.substring(0, 7)}`,
      resource_type: "repository",
      metadata: {
        repo: repoFullName,
        target_commit: targetCommitSha,
        new_commit: newCommit.sha,
      },
    });

    console.log(`Successfully rolled back ${repoFullName} to ${targetCommitSha}`);

    return new Response(
      JSON.stringify({
        success: true,
        newCommitSha: newCommit.sha,
        message: `Successfully rolled back to ${targetCommitSha.substring(0, 7)}`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error performing rollback:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
