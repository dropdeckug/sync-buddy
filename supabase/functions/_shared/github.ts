// Shared GitHub helpers for edge functions.
// Edge functions import this via relative path: ../_shared/github.ts
const GH = "https://api.github.com";
const UA = "GitSyncer-EdgeFn";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function gh(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${GH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": UA,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${init.method ?? "GET"} ${path} ${res.status}: ${text}`);
  }
  return res.json();
}

export interface UploadFile {
  // Path INSIDE the repository (e.g. "docs/intro.md").
  path: string;
  // Either base64-encoded binary content...
  contentBase64?: string;
  // ...or plain UTF-8 text content.
  contentText?: string;
}

/**
 * Commit a batch of files to a repo in a single commit, using the Git Data API.
 * Preserves all existing files outside the touched paths.
 */
export async function commitFiles(opts: {
  token: string;
  repoFullName: string; // "owner/name"
  branch: string;
  files: UploadFile[];
  message: string;
  // Paths inside the repo to DELETE in this commit (e.g. when mirroring removals).
  deletePaths?: string[];
}): Promise<{ commitSha: string; treeSha: string }> {
  const { token, repoFullName, branch, files, message } = opts;
  const deletePaths = opts.deletePaths ?? [];
  // 1. Latest commit on branch.
  const ref = await gh(token, `/repos/${repoFullName}/git/refs/heads/${branch}`);
  const latestCommitSha = ref.object.sha;
  const latestCommit = await gh(token, `/repos/${repoFullName}/git/commits/${latestCommitSha}`);
  const baseTreeSha = latestCommit.tree.sha;

  // 2. Create blobs for every file.
  const treeEntries: any[] = [];
  for (const f of files) {
    const blob = await gh(token, `/repos/${repoFullName}/git/blobs`, {
      method: "POST",
      body: JSON.stringify(
        f.contentBase64 !== undefined
          ? { content: f.contentBase64, encoding: "base64" }
          : { content: f.contentText ?? "", encoding: "utf-8" }
      ),
    });
    treeEntries.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  for (const p of deletePaths) {
    treeEntries.push({ path: p, mode: "100644", type: "blob", sha: null });
  }

  if (treeEntries.length === 0) {
    return { commitSha: latestCommitSha, treeSha: baseTreeSha };
  }

  // 3. New tree based on previous one.
  const tree = await gh(token, `/repos/${repoFullName}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
  });

  // 4. New commit.
  const commit = await gh(token, `/repos/${repoFullName}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [latestCommitSha] }),
  });

  // 5. Fast-forward branch.
  await gh(token, `/repos/${repoFullName}/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha }),
  });

  return { commitSha: commit.sha, treeSha: tree.sha };
}

/** Recursively list every blob (file) under a repo path on a given ref. */
export async function listRepoFiles(opts: {
  token: string;
  repoFullName: string;
  ref: string;
  subpath?: string;
}): Promise<Array<{ path: string; sha: string }>> {
  const { token, repoFullName, ref, subpath = "" } = opts;
  // Resolve ref -> commit -> tree
  const branchRef = await gh(token, `/repos/${repoFullName}/git/refs/heads/${ref}`).catch(
    () => null,
  );
  let commitSha: string;
  if (branchRef) {
    commitSha = branchRef.object.sha;
  } else {
    // Maybe ref is already a sha
    commitSha = ref;
  }
  const commit = await gh(token, `/repos/${repoFullName}/git/commits/${commitSha}`);
  const tree = await gh(
    token,
    `/repos/${repoFullName}/git/trees/${commit.tree.sha}?recursive=1`,
  );
  const prefix = subpath ? subpath.replace(/^\/+|\/+$/g, "") + "/" : "";
  const files = (tree.tree as any[])
    .filter((e) => e.type === "blob")
    .filter((e) => (prefix ? (e.path as string).startsWith(prefix) : true))
    .map((e) => ({ path: e.path as string, sha: e.sha as string }));
  return files;
}

/** Get raw blob content (base64) for a given blob sha. */
export async function getBlob(opts: {
  token: string;
  repoFullName: string;
  sha: string;
}): Promise<string> {
  const { token, repoFullName, sha } = opts;
  const blob = await gh(token, `/repos/${repoFullName}/git/blobs/${sha}`);
  // Blob comes back with "content" base64 (sometimes line-wrapped) and "encoding":"base64".
  return (blob.content as string).replace(/\n/g, "");
}

/** Look up account row + access token by accountId. */
export async function getAccountToken(supabase: any, accountId: string): Promise<string> {
  const { data, error } = await supabase
    .from("github_accounts")
    .select("access_token")
    .eq("id", accountId)
    .single();
  if (error || !data) throw new Error("GitHub account not found");
  return data.access_token as string;
}
