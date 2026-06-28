import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  commitFiles,
  corsHeaders,
  getAccountToken,
  getBlob,
  jsonResponse,
  listRepoFiles,
} from "../_shared/github.ts";

/**
 * Mirrors a linked folder: copies files from
 *   <source_repo>/<source_subpath> on <source_ref>
 * into
 *   <dest_repo>/<dest_path>
 * as a single commit, only writing files whose content differs and deleting files
 * that have been removed from the source.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { linkedFolderId } = await req.json();
    if (!linkedFolderId) return jsonResponse({ error: "Missing linkedFolderId" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: lf, error: lfErr } = await supabase
      .from("linked_folders")
      .select("*, repos:dest_repo_id(full_name, default_branch)")
      .eq("id", linkedFolderId)
      .single();
    if (lfErr || !lf) return jsonResponse({ error: "linked_folder not found" }, 404);

    const token = await getAccountToken(supabase, lf.account_id);
    const destRepoFullName = (lf.repos as any).full_name as string;
    const destBranch = (lf.repos as any).default_branch || "main";

    // 1. List source files at subpath.
    const sourceFiles = await listRepoFiles({
      token,
      repoFullName: lf.source_repo_full_name,
      ref: lf.source_ref || "main",
      subpath: lf.source_subpath || "",
    });
    const sourcePrefix = (lf.source_subpath || "").replace(/^\/+|\/+$/g, "");
    const destPrefix = (lf.dest_path || "").replace(/^\/+|\/+$/g, "");

    // 2. List existing dest files in target folder so we can compute removals.
    const destFiles = await listRepoFiles({
      token,
      repoFullName: destRepoFullName,
      ref: destBranch,
      subpath: destPrefix,
    }).catch(() => []);
    const destSet = new Map(destFiles.map((f) => [f.path, f.sha]));

    // 3. Build write list. We compare blob shas to skip unchanged files.
    const filesToWrite: { path: string; contentBase64: string }[] = [];
    const touchedDestPaths = new Set<string>();
    for (const sf of sourceFiles) {
      const relative = sourcePrefix
        ? sf.path.slice(sourcePrefix.length + 1)
        : sf.path;
      const destPathFull = destPrefix ? `${destPrefix}/${relative}` : relative;
      touchedDestPaths.add(destPathFull);
      if (destSet.get(destPathFull) === sf.sha) continue;
      const content = await getBlob({
        token,
        repoFullName: lf.source_repo_full_name,
        sha: sf.sha,
      });
      filesToWrite.push({ path: destPathFull, contentBase64: content });
    }

    // 4. Compute deletions: dest files no longer in source.
    const deletePaths: string[] = [];
    for (const [p] of destSet) {
      if (!touchedDestPaths.has(p) && p !== `${destPrefix}/.gitkeep`) {
        deletePaths.push(p);
      }
    }

    if (filesToWrite.length === 0 && deletePaths.length === 0) {
      return jsonResponse({ success: true, message: "Already in sync", changes: 0 });
    }

    const result = await commitFiles({
      token,
      repoFullName: destRepoFullName,
      branch: destBranch,
      files: filesToWrite,
      deletePaths,
      message: `Synced folder ${destPrefix} from ${lf.source_repo_full_name}@${lf.source_ref}`,
    });

    await supabase
      .from("linked_folders")
      .update({ last_synced_sha: result.commitSha, updated_at: new Date().toISOString() })
      .eq("id", lf.id);

    return jsonResponse({
      success: true,
      commitSha: result.commitSha,
      written: filesToWrite.length,
      deleted: deletePaths.length,
    });
  } catch (e) {
    console.error("sync-linked-folder", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
