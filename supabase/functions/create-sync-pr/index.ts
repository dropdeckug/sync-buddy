import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CreatePRRequest {
  syncGroupId: string;
  sourceRepo: string;
  targetRepo: string;
  files: Array<{ path: string; content: string }>;
  accessToken: string;
  title?: string;
  description?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      syncGroupId,
      sourceRepo,
      targetRepo,
      files,
      accessToken,
      title,
      description,
    } = await req.json() as CreatePRRequest;

    if (!syncGroupId || !sourceRepo || !targetRepo || !files || !accessToken) {
      throw new Error("Missing required parameters");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get sync group settings
    const { data: syncGroup, error: groupError } = await supabase
      .from("sync_groups")
      .select("*")
      .eq("id", syncGroupId)
      .single();

    if (groupError) throw groupError;

    const branchPrefix = syncGroup.pr_branch_prefix || "sync/";
    const branchName = `${branchPrefix}${Date.now()}`;

    console.log(`Creating PR in ${targetRepo} from ${sourceRepo}`);

    // Get the default branch
    const repoResponse = await fetch(
      `https://api.github.com/repos/${targetRepo}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!repoResponse.ok) {
      throw new Error(`Failed to get repository info for ${targetRepo}`);
    }

    const repo = await repoResponse.json();
    const defaultBranch = repo.default_branch;

    // Get the reference to the default branch
    const refResponse = await fetch(
      `https://api.github.com/repos/${targetRepo}/git/refs/heads/${defaultBranch}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!refResponse.ok) {
      throw new Error(`Failed to get reference for ${defaultBranch}`);
    }

    const ref = await refResponse.json();
    const baseSha = ref.object.sha;

    // Create a new branch
    const createBranchResponse = await fetch(
      `https://api.github.com/repos/${targetRepo}/git/refs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: baseSha,
        }),
      }
    );

    if (!createBranchResponse.ok) {
      const error = await createBranchResponse.text();
      throw new Error(`Failed to create branch: ${error}`);
    }

    // Get the base tree
    const baseTreeResponse = await fetch(
      `https://api.github.com/repos/${targetRepo}/git/trees/${baseSha}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    const baseTree = await baseTreeResponse.json();

    // Create blobs for each file
    const treeItems = await Promise.all(
      files.map(async (file) => {
        const blobResponse = await fetch(
          `https://api.github.com/repos/${targetRepo}/git/blobs`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/vnd.github.v3+json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: file.content,
              encoding: "utf-8",
            }),
          }
        );

        if (!blobResponse.ok) {
          throw new Error(`Failed to create blob for ${file.path}`);
        }

        const blob = await blobResponse.json();

        return {
          path: file.path,
          mode: "100644" as const,
          type: "blob" as const,
          sha: blob.sha,
        };
      })
    );

    // Create a new tree
    const newTreeResponse = await fetch(
      `https://api.github.com/repos/${targetRepo}/git/trees`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          base_tree: baseTree.sha,
          tree: treeItems,
        }),
      }
    );

    if (!newTreeResponse.ok) {
      const error = await newTreeResponse.text();
      throw new Error(`Failed to create tree: ${error}`);
    }

    const newTree = await newTreeResponse.json();

    // Create a commit
    const commitMessage = title || `Sync from ${sourceRepo}`;
    const commitResponse = await fetch(
      `https://api.github.com/repos/${targetRepo}/git/commits`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: commitMessage,
          tree: newTree.sha,
          parents: [baseSha],
        }),
      }
    );

    if (!commitResponse.ok) {
      const error = await commitResponse.text();
      throw new Error(`Failed to create commit: ${error}`);
    }

    const commit = await commitResponse.json();

    // Update the branch reference
    const updateRefResponse = await fetch(
      `https://api.github.com/repos/${targetRepo}/git/refs/heads/${branchName}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sha: commit.sha,
        }),
      }
    );

    if (!updateRefResponse.ok) {
      const error = await updateRefResponse.text();
      throw new Error(`Failed to update branch: ${error}`);
    }

    // Create the pull request
    const prTitle = title || `[Sync] Changes from ${sourceRepo}`;
    const prBody = description || `This PR was automatically created by the sync tool.\n\nSource: ${sourceRepo}\nFiles synced: ${files.length}`;

    const prResponse = await fetch(
      `https://api.github.com/repos/${targetRepo}/pulls`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: prTitle,
          body: prBody,
          head: branchName,
          base: defaultBranch,
        }),
      }
    );

    if (!prResponse.ok) {
      const error = await prResponse.text();
      throw new Error(`Failed to create pull request: ${error}`);
    }

    const pr = await prResponse.json();

    // Save PR to database
    const { error: insertError } = await supabase
      .from("sync_pull_requests")
      .insert({
        sync_group_id: syncGroupId,
        repo_full_name: targetRepo,
        pr_number: pr.number,
        pr_url: pr.html_url,
        title: prTitle,
        status: "open",
      });

    if (insertError) {
      console.error("Error saving PR to database:", insertError);
    }

    // Log to activity feed
    await supabase.from("activity_feed").insert({
      activity_type: "pr_created",
      title: `Pull request created in ${targetRepo}`,
      description: prTitle,
      resource_type: "pull_request",
      metadata: {
        pr_number: pr.number,
        pr_url: pr.html_url,
        source_repo: sourceRepo,
        target_repo: targetRepo,
        files_count: files.length,
      },
    });

    console.log(`Created PR #${pr.number} in ${targetRepo}`);

    return new Response(
      JSON.stringify({
        success: true,
        pr_number: pr.number,
        pr_url: pr.html_url,
        branch: branchName,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error creating PR:", error);
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
