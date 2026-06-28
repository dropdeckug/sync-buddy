import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { commitFiles, corsHeaders, getAccountToken, jsonResponse } from "../_shared/github.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { accountId, repoFullName, branch, folderPath } = await req.json();
    if (!accountId || !repoFullName || !folderPath) {
      return jsonResponse({ error: "Missing accountId, repoFullName, or folderPath" }, 400);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = await getAccountToken(supabase, accountId);
    const clean = folderPath.replace(/^\/+|\/+$/g, "");
    const result = await commitFiles({
      token,
      repoFullName,
      branch: branch || "main",
      files: [{ path: `${clean}/.gitkeep`, contentText: "" }],
      message: `Create folder ${clean}`,
    });
    return jsonResponse({ success: true, ...result });
  } catch (e) {
    console.error("github-create-empty-folder", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
