import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { accountId, repoName, description, isPrivate, files } = await req.json();

    if (!accountId || !repoName || !files || files.length === 0) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get GitHub access token
    const { data: account, error: accountError } = await supabaseClient
      .from("github_accounts")
      .select("access_token, github_username")
      .eq("id", accountId)
      .single();

    if (accountError || !account) {
      return new Response(JSON.stringify({ error: "GitHub account not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = account.access_token;
    const headers = {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    };

    // 1. Create the repository
    const createRepoRes = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: repoName,
        description: description || `Created via GitSync Drop`,
        private: isPrivate || false,
        auto_init: true,
      }),
    });

    if (!createRepoRes.ok) {
      const errData = await createRepoRes.json();
      return new Response(JSON.stringify({ error: errData.message || "Failed to create repo" }), {
        status: createRepoRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const repo = await createRepoRes.json();

    // 2. Get the default branch ref to get the base tree SHA
    // Wait a moment for repo initialization
    await new Promise((r) => setTimeout(r, 2000));

    const refRes = await fetch(
      `https://api.github.com/repos/${repo.full_name}/git/ref/heads/${repo.default_branch}`,
      { headers }
    );

    if (!refRes.ok) {
      return new Response(JSON.stringify({
        success: true,
        repo: { name: repo.name, full_name: repo.full_name, html_url: repo.html_url },
        filesUploaded: 0,
        message: "Repo created but file upload needs retry - repo still initializing",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const refData = await refRes.json();
    const latestCommitSha = refData.object.sha;

    // 3. Get the base tree
    const commitRes = await fetch(
      `https://api.github.com/repos/${repo.full_name}/git/commits/${latestCommitSha}`,
      { headers }
    );
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // 4. Create blobs for each file
    const treeItems = [];
    for (const file of files) {
      const blobRes = await fetch(
        `https://api.github.com/repos/${repo.full_name}/git/blobs`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            content: file.content,
            encoding: "base64",
          }),
        }
      );

      if (!blobRes.ok) {
        console.error(`Failed to create blob for ${file.path}`);
        continue;
      }

      const blob = await blobRes.json();
      treeItems.push({
        path: file.path,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      });
    }

    if (treeItems.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        repo: { name: repo.name, full_name: repo.full_name, html_url: repo.html_url },
        filesUploaded: 0,
        message: "Repo created but no files could be uploaded",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Create a new tree
    const treeRes = await fetch(
      `https://api.github.com/repos/${repo.full_name}/git/trees`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: treeItems,
        }),
      }
    );
    const treeData = await treeRes.json();

    // 6. Create a commit
    const newCommitRes = await fetch(
      `https://api.github.com/repos/${repo.full_name}/git/commits`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: `Initial upload via GitSync Drop (${treeItems.length} files)`,
          tree: treeData.sha,
          parents: [latestCommitSha],
        }),
      }
    );
    const newCommit = await newCommitRes.json();

    // 7. Update the ref
    await fetch(
      `https://api.github.com/repos/${repo.full_name}/git/refs/heads/${repo.default_branch}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ sha: newCommit.sha }),
      }
    );

    // 8. Save repo to database
    await supabaseClient.from("repos").upsert({
      account_id: accountId,
      name: repo.name,
      full_name: repo.full_name,
      github_id: String(repo.id),
      owner: repo.owner.login,
      default_branch: repo.default_branch,
      is_private: repo.private,
      last_commit_sha: newCommit.sha,
      last_commit_date: new Date().toISOString(),
    }, { onConflict: "github_id" });

    return new Response(JSON.stringify({
      success: true,
      repo: {
        name: repo.name,
        full_name: repo.full_name,
        html_url: repo.html_url,
        default_branch: repo.default_branch,
      },
      filesUploaded: treeItems.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
