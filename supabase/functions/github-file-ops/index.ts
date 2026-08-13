import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getAccountToken, jsonResponse } from "../_shared/github.ts";

const GH = "https://api.github.com";

async function gh(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${GH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "GitSyncer-EdgeFn",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub ${init.method ?? "GET"} ${path} ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

interface TreeEntry {
  path: string;
  mode: string;
  type: "blob";
  sha?: string | null;
  content?: string;
}

/** Commit arbitrary tree entries (blob shas, new content, or deletions). */
async function commitEntries(opts: {
  token: string;
  repoFullName: string;
  branch: string;
  entries: TreeEntry[];
  message: string;
}) {
  const { token, repoFullName, entries, message } = opts;
  let branch = opts.branch;
  let ref: any = null;
  try {
    ref = await gh(token, `/repos/${repoFullName}/git/ref/heads/${branch}`);
  } catch {
    const meta = await gh(token, `/repos/${repoFullName}`);
    branch = meta.default_branch;
    ref = await gh(token, `/repos/${repoFullName}/git/ref/heads/${branch}`);
  }
  const headSha = ref.object.sha;
  const headCommit = await gh(token, `/repos/${repoFullName}/git/commits/${headSha}`);

  const tree = await gh(token, `/repos/${repoFullName}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: headCommit.tree.sha, tree: entries }),
  });
  const commit = await gh(token, `/repos/${repoFullName}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [headSha] }),
  });
  await gh(token, `/repos/${repoFullName}/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: true }),
  });
  return { commitSha: commit.sha, branch };
}

/** Every blob under a path (or the blob itself when the path is a file). */
async function blobsUnder(token: string, repoFullName: string, branch: string, path: string) {
  const ref = await gh(token, `/repos/${repoFullName}/git/ref/heads/${branch}`);
  const commit = await gh(token, `/repos/${repoFullName}/git/commits/${ref.object.sha}`);
  const tree = await gh(token, `/repos/${repoFullName}/git/trees/${commit.tree.sha}?recursive=1`);
  const clean = path.replace(/^\/+|\/+$/g, "");
  return (tree.tree as any[])
    .filter((e) => e.type === "blob")
    .filter((e) => e.path === clean || e.path.startsWith(`${clean}/`))
    .map((e) => ({ path: e.path as string, sha: e.sha as string, mode: (e.mode as string) || "100644" }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const { accountId, repoFullName, action } = body;
    const branch = body.branch || "main";
    if (!accountId || !repoFullName || !action) {
      return jsonResponse({ error: "Missing accountId, repoFullName or action" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = await getAccountToken(supabase, accountId);

    let result: { commitSha: string; branch: string };

    if (action === "create-file") {
      const path = String(body.path || "").replace(/^\/+/, "");
      if (!path) return jsonResponse({ error: "Missing path" }, 400);
      result = await commitEntries({
        token,
        repoFullName,
        branch,
        entries: [
          body.contentBase64 !== undefined
            ? { path, mode: "100644", type: "blob", sha: (await gh(token, `/repos/${repoFullName}/git/blobs`, {
                method: "POST",
                body: JSON.stringify({ content: body.contentBase64, encoding: "base64" }),
              })).sha }
            : { path, mode: "100644", type: "blob", content: body.content ?? "" },
        ],
        message: body.commitMessage || `Create ${path}`,
      });
    } else if (action === "create-folder") {
      const path = String(body.path || "").replace(/^\/+|\/+$/g, "");
      if (!path) return jsonResponse({ error: "Missing path" }, 400);
      result = await commitEntries({
        token,
        repoFullName,
        branch,
        entries: [{ path: `${path}/.gitkeep`, mode: "100644", type: "blob", content: "" }],
        message: body.commitMessage || `Create folder ${path}`,
      });
    } else if (action === "delete") {
      const path = String(body.path || "").replace(/^\/+|\/+$/g, "");
      if (!path) return jsonResponse({ error: "Missing path" }, 400);
      const blobs = await blobsUnder(token, repoFullName, branch, path);
      if (blobs.length === 0) return jsonResponse({ error: `Nothing found at ${path}` }, 404);
      result = await commitEntries({
        token,
        repoFullName,
        branch,
        entries: blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob" as const, sha: null })),
        message: body.commitMessage || `Delete ${path}`,
      });
      return jsonResponse({ success: true, deleted: blobs.length, ...result });
    } else if (action === "rename") {
      const from = String(body.path || "").replace(/^\/+|\/+$/g, "");
      const to = String(body.newPath || "").replace(/^\/+|\/+$/g, "");
      if (!from || !to) return jsonResponse({ error: "Missing path or newPath" }, 400);
      const blobs = await blobsUnder(token, repoFullName, branch, from);
      if (blobs.length === 0) return jsonResponse({ error: `Nothing found at ${from}` }, 404);
      const entries: TreeEntry[] = [];
      for (const b of blobs) {
        const suffix = b.path === from ? "" : b.path.slice(from.length);
        entries.push({ path: `${to}${suffix}`, mode: b.mode, type: "blob", sha: b.sha });
        entries.push({ path: b.path, mode: b.mode, type: "blob", sha: null });
      }
      result = await commitEntries({
        token,
        repoFullName,
        branch,
        entries,
        message: body.commitMessage || `Rename ${from} to ${to}`,
      });
      return jsonResponse({ success: true, moved: blobs.length, ...result });
    } else {
      return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }

    return jsonResponse({ success: true, ...result });
  } catch (e) {
    console.error("github-file-ops", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
