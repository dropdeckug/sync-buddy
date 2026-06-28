import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { commitFiles, corsHeaders, getAccountToken, jsonResponse } from "../_shared/github.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { accountId, repoFullName, branch, basePath, files, commitMessage } =
      await req.json();
    if (!accountId || !repoFullName || !Array.isArray(files)) {
      return jsonResponse({ error: "Missing accountId, repoFullName, or files" }, 400);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = await getAccountToken(supabase, accountId);

    // Normalize basePath, prepend to each file.
    const base = (basePath ?? "").replace(/^\/+|\/+$/g, "");
    const prefixed = files.map((f: any) => ({
      path: base ? `${base}/${f.path.replace(/^\/+/, "")}` : f.path.replace(/^\/+/, ""),
      contentBase64: f.contentBase64,
      contentText: f.contentText,
    }));

    const result = await commitFiles({
      token,
      repoFullName,
      branch: branch || "main",
      files: prefixed,
      message: commitMessage || `Add ${prefixed.length} file(s) to ${base || "/"}`,
    });

    return jsonResponse({ success: true, ...result, fileCount: prefixed.length });
  } catch (e) {
    console.error("github-upload-folder", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
