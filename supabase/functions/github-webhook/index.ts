import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPush } from "../_shared/push.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

async function verifySignature(payload: string, signature: string | null): Promise<boolean> {
  const secret = Deno.env.get("GITHUB_WEBHOOK_SECRET");
  if (!secret) {
    console.error("GITHUB_WEBHOOK_SECRET is not configured");
    return false;
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

  // A missing/stale signature usually means the GitHub hook was created before
  // GITHUB_WEBHOOK_SECRET existed (or the secret was rotated). Instead of
  // dropping real pushes, authenticate the delivery against the GitHub API
  // using the owner's stored token, then repair the hook secret in background.
  let authenticated = sigValid;
  if (!authenticated) {
    try {
      const headSha: string | undefined = payload?.head_commit?.id ?? payload?.after;
      const { data: repoRow } = await supabase
        .from("repos")
        .select("account_id")
        .eq("full_name", repoFullName)
        .maybeSingle();
      let token: string | null = null;
      if (repoRow?.account_id) {
        const { data: acct } = await supabase
          .from("github_accounts")
          .select("access_token")
          .eq("id", repoRow.account_id)
          .maybeSingle();
        token = acct?.access_token ?? null;
      }
      if (token && headSha) {
        const verifyRes = await fetch(
          `https://api.github.com/repos/${repoFullName}/commits/${headSha}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
              "User-Agent": "RepoSync-App",
            },
          },
        );
        if (verifyRes.ok) {
          const commit = await verifyRes.json();
          authenticated = commit?.sha === headSha;
        }
      }
      if (authenticated) {
        console.log(`Signature invalid but push verified via GitHub API for ${repoFullName}; repairing hook secret`);
        EdgeRuntime.waitUntil(
          fetch(`${supabaseUrl}/functions/v1/register-webhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ repoFullName, accessToken: token, action: "register" }),
          }).catch((e) => console.error("hook secret repair failed:", e)),
        );
      }
    } catch (e) {
      console.error("fallback verification failed", e);
    }
  }

  if (!authenticated) {
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
    if (headCommit?.message?.startsWith("Synced from ")) {
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
      // Any externally pushed repository in a group becomes the temporary
      // source. Mirror commits created by this app are ignored above, which
      // prevents webhook loops and stops synced children from taking over.
      const { data: motherGroups } = await supabase
        .from("sync_groups")
        .select("id, account_id, auto_sync_enabled")
        .eq("mother_repo_id", repo.id);
      const { data: childMemberships } = await supabase
        .from("sync_group_repos")
        .select("sync_group_id, sync_groups!inner(id, account_id, auto_sync_enabled)")
        .eq("repo_id", repo.id);

      const groups = new Map<string, { id: string; account_id: string; auto_sync_enabled: boolean }>();
      for (const group of motherGroups || []) groups.set(group.id, group);
      for (const membership of childMemberships || []) {
        const group = membership.sync_groups as unknown as { id: string; account_id: string; auto_sync_enabled: boolean };
        if (group) groups.set(group.id, group);
      }

      for (const group of groups.values()) {
        if (group.auto_sync_enabled === false) continue;

        // Persist the latest external source so the UI and future manual syncs
        // keep using it until another repository receives a real push.
        if ((motherGroups || []).every((candidate) => candidate.id !== group.id)) {
          const { data: currentGroup } = await supabase
            .from("sync_groups")
            .select("mother_repo_id")
            .eq("id", group.id)
            .single();
          if (currentGroup?.mother_repo_id && currentGroup.mother_repo_id !== repo.id) {
            await supabase
              .from("sync_group_repos")
              .upsert(
                { sync_group_id: group.id, repo_id: currentGroup.mother_repo_id },
                { onConflict: "sync_group_id,repo_id" },
              );
            await supabase
              .from("sync_group_repos")
              .delete()
              .eq("sync_group_id", group.id)
              .eq("repo_id", repo.id);
            await supabase
              .from("sync_groups")
              .update({ mother_repo_id: repo.id })
              .eq("id", group.id);
          }
        }

        // Count the repos that will receive this commit for the notification.
        const { count: childCount } = await supabase
          .from("sync_group_repos")
          .select("id", { count: "exact", head: true })
          .eq("sync_group_id", group.id);
        const targetCount = Math.max((childCount ?? 0), 0);

        EdgeRuntime.waitUntil(
          sendPush({
            accountId: group.account_id,
            title: `New commit in ${repoFullName.split("/").pop()}`,
            body: `${headCommit?.message?.split("\n")[0]?.slice(0, 100) ?? "Push received"} — syncing to ${targetCount} ${targetCount === 1 ? "repository" : "repositories"}`,
            tag: `sync-${group.id}`,
            progress: 0,
            url: "/",
            data: { type: "commit_received", syncGroupId: group.id },
          }),
        );

        EdgeRuntime.waitUntil(

          fetch(`${supabaseUrl}/functions/v1/sync-repos`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ syncGroupId: group.id, accountId: group.account_id, sourceRepoId: repo.id }),
          }).then(async (response) => {
            if (!response.ok) throw new Error(await response.text());
          }).catch((e) => console.error("sync-repos fan-out:", e)),
        );
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
