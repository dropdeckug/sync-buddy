import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

async function verifySignature(payload: string, signature: string | null): Promise<boolean> {
  const secret = Deno.env.get("GITHUB_WEBHOOK_SECRET");
  if (!secret) {
    console.warn("GITHUB_WEBHOOK_SECRET not set; skipping signature check");
    return true;
  }
  if (!signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const computed =
    "sha256=" +
    Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  if (computed.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const eventType = req.headers.get("x-github-event") || "unknown";
  const deliveryId = req.headers.get("x-github-delivery");

  const sigValid = await verifySignature(rawBody, signature);

  let payload: any = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // ignore
  }
  const repoFullName: string = payload?.repository?.full_name ?? "unknown";

  // Always log delivery for diagnostics.
  const eventLog = await supabase
    .from("webhook_events")
    .insert({
      repo_full_name: repoFullName,
      event_type: eventType,
      delivery_id: deliveryId,
      signature_valid: sigValid,
      processed: false,
      payload_summary: {
        ref: payload?.ref,
        head_commit: payload?.head_commit?.id,
        message: payload?.head_commit?.message,
        commits: (payload?.commits || []).length,
      },
    })
    .select()
    .single();
  const eventId = eventLog.data?.id;

  const markProcessed = async (error?: string) => {
    if (!eventId) return;
    await supabase
      .from("webhook_events")
      .update({ processed: !error, error: error ?? null })
      .eq("id", eventId);
  };

  if (!sigValid) {
    await markProcessed("invalid signature");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (eventType === "ping") {
    await markProcessed();
    return new Response(JSON.stringify({ message: "pong" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (eventType !== "push") {
    await markProcessed();
    return new Response(JSON.stringify({ message: "ignored" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const headCommit = payload.head_commit;
    if (headCommit?.message?.startsWith("Synced ")) {
      await markProcessed();
      return new Response(JSON.stringify({ message: "ignored sync commit" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------- Path 1: sync_groups (existing mother/child sync) --------
    const { data: repo } = await supabase
      .from("repos")
      .select("id, account_id")
      .eq("full_name", repoFullName)
      .maybeSingle();

    if (repo) {
      const { data: sgRepos } = await supabase
        .from("sync_group_repos")
        .select("sync_group_id")
        .eq("repo_id", repo.id);
      const { data: motherGroups } = await supabase
        .from("sync_groups")
        .select("id")
        .eq("mother_repo_id", repo.id);
      const groupIds = new Set<string>();
      sgRepos?.forEach((r) => groupIds.add(r.sync_group_id));
      motherGroups?.forEach((g) => groupIds.add(g.id));

      if (groupIds.size > 0) {
        const { data: groups } = await supabase
          .from("sync_groups")
          .select("id, auto_sync_enabled")
          .in("id", Array.from(groupIds));
        const enabled = (groups || []).filter((g) => g.auto_sync_enabled !== false);
        for (const g of enabled) {
          fetch(`${supabaseUrl}/functions/v1/sync-repos`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ syncGroupId: g.id, accountId: repo.account_id }),
          }).catch((e) => console.error("sync-repos fan-out:", e));
        }
      }
    }

    // -------- Path 2: linked_folders (folder-level mirror) --------
    const { data: linkedFolders } = await supabase
      .from("linked_folders")
      .select("id, source_subpath, auto_sync")
      .eq("source_repo_full_name", repoFullName);

    // Build the set of paths changed in this push.
    const changedPaths = new Set<string>();
    for (const c of payload.commits || []) {
      for (const p of c.added || []) changedPaths.add(p);
      for (const p of c.modified || []) changedPaths.add(p);
      for (const p of c.removed || []) changedPaths.add(p);
    }

    let foldersTriggered = 0;
    for (const lf of linkedFolders || []) {
      if (!lf.auto_sync) continue;
      const sub = (lf.source_subpath || "").replace(/^\/+|\/+$/g, "");
      const matches =
        !sub ||
        Array.from(changedPaths).some(
          (p) => p === sub || p.startsWith(sub + "/"),
        );
      if (!matches) continue;
      foldersTriggered++;
      fetch(`${supabaseUrl}/functions/v1/sync-linked-folder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ linkedFolderId: lf.id }),
      }).catch((e) => console.error("sync-linked-folder fan-out:", e));
    }

    await markProcessed();
    return new Response(
      JSON.stringify({ ok: true, foldersTriggered }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("webhook error", e);
    await markProcessed(msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
