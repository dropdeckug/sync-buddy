import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/github.ts";

/**
 * Creates a linked_folders row, registers a GitHub webhook on the SOURCE repo
 * (so that future pushes can trigger sync), and performs an initial sync.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const {
      accountId,
      destRepoId,
      destPath,
      sourceRepoFullName,
      sourceSubpath = "",
      sourceRef = "main",
      autoSync = true,
    } = await req.json();

    if (!accountId || !destRepoId || !destPath || !sourceRepoFullName) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: acct } = await supabase
      .from("github_accounts")
      .select("access_token")
      .eq("id", accountId)
      .single();
    if (!acct?.access_token) return jsonResponse({ error: "Account not found" }, 404);

    const dest = (destPath as string).replace(/^\/+|\/+$/g, "");

    // Insert/upsert linked_folder.
    const { data: lf, error: lfErr } = await supabase
      .from("linked_folders")
      .upsert(
        {
          account_id: accountId,
          dest_repo_id: destRepoId,
          dest_path: dest,
          source_repo_full_name: sourceRepoFullName,
          source_subpath: sourceSubpath,
          source_ref: sourceRef,
          auto_sync: autoSync,
        },
        { onConflict: "dest_repo_id,dest_path" },
      )
      .select()
      .single();
    if (lfErr) throw lfErr;

    // Register webhook on the SOURCE repo (best-effort).
    if (autoSync) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/register-webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({
            repoFullName: sourceRepoFullName,
            accessToken: acct.access_token,
            action: "register",
          }),
        });
      } catch (e) {
        console.warn("Webhook registration failed:", e);
      }
    }

    // Initial sync.
    let syncResult: any = null;
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/sync-linked-folder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ linkedFolderId: lf.id }),
      });
      syncResult = await r.json();
    } catch (e) {
      console.error("Initial sync failed:", e);
    }

    return jsonResponse({ success: true, linkedFolder: lf, initialSync: syncResult });
  } catch (e) {
    console.error("link-folder", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
