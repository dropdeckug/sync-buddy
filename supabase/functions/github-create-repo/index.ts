import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function uploadFilesToRepo(
  token: string,
  repoFullName: string,
  defaultBranch: string,
  files: { path: string; content: string }[],
  supabaseClient: any,
  accountId: string,
  repoName: string,
  repoId: string
) {
  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  try {
    // Wait for repo init
    await new Promise((r) => setTimeout(r, 2000));

    const refRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/ref/heads/${defaultBranch}`,
      { headers }
    );
    if (!refRes.ok) {
      console.error("Failed to get ref, repo may still be initializing");
      return;
    }

    const refData = await refRes.json();
    const latestCommitSha = refData.object.sha;

    const commitRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/commits/${latestCommitSha}`,
      { headers }
    );
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // Create blobs in batches of 5 for speed
    const treeItems: any[] = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (file) => {
          const blobRes = await fetch(
            `https://api.github.com/repos/${repoFullName}/git/blobs`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({ content: file.content, encoding: "base64" }),
            }
          );
          if (!blobRes.ok) return null;
          const blob = await blobRes.json();
          return { path: file.path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
        })
      );
      treeItems.push(...results.filter(Boolean));
    }

    if (treeItems.length === 0) return;

    // Create tree
    const treeRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/trees`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
      }
    );
    const treeData = await treeRes.json();

    // Create commit
    const newCommitRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/commits`,
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

    // Update ref
    await fetch(
      `https://api.github.com/repos/${repoFullName}/git/refs/heads/${defaultBranch}`,
      { method: "PATCH", headers, body: JSON.stringify({ sha: newCommit.sha }) }
    );

    // Update DB
    await supabaseClient.from("repos").upsert({
      account_id: accountId,
      name: repoName,
      full_name: repoFullName,
      github_id: String(repoId),
      owner: repoFullName.split("/")[0],
      default_branch: defaultBranch,
      is_private: false,
      last_commit_sha: newCommit.sha,
      last_commit_date: new Date().toISOString(),
    }, { onConflict: "github_id" });

    console.log(`Background upload complete: ${treeItems.length} files to ${repoFullName}`);
  } catch (err) {
    console.error("Background upload error:", err);
  }
}

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

    // 1. Create the repository FIRST (fast operation)
    const createRepoRes = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: repoName,
        description: description || "Created via GitSync Drop",
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

    // 2. Upload files in the BACKGROUND using waitUntil
    // This means the response returns immediately while files upload server-side
    const uploadPromise = uploadFilesToRepo(
      token,
      repo.full_name,
      repo.default_branch,
      files,
      supabaseClient,
      accountId,
      repo.name,
      String(repo.id)
    );

    // Use EdgeRuntime.waitUntil to keep the function alive after response
    // @ts-ignore - Deno edge runtime API
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(uploadPromise);
    } else {
      // Fallback: just await it
      await uploadPromise;
    }

    // Return IMMEDIATELY with repo info
    return new Response(JSON.stringify({
      success: true,
      repo: {
        name: repo.name,
        full_name: repo.full_name,
        html_url: repo.html_url,
        default_branch: repo.default_branch,
      },
      filesUploaded: files.length,
      backgroundUpload: true,
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
