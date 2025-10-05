import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { accountId, repoId, path = "" } = await req.json();

    if (!accountId || !repoId) {
      throw new Error("Missing accountId or repoId");
    }

    // Get GitHub account to retrieve access token
    const { data: account, error: accountError } = await supabaseClient
      .from("github_accounts")
      .select("access_token")
      .eq("id", accountId)
      .single();

    if (accountError || !account) {
      throw new Error("GitHub account not found");
    }

    // Get repository info
    const { data: repo, error: repoError } = await supabaseClient
      .from("repos")
      .select("full_name, default_branch")
      .eq("id", repoId)
      .single();

    if (repoError || !repo) {
      throw new Error("Repository not found");
    }

    // Fetch contents from GitHub
    const url = `https://api.github.com/repos/${repo.full_name}/contents/${path}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${account.access_token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch repository contents from GitHub");
    }

    const contents = await response.json();

    return new Response(
      JSON.stringify({ contents }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in github-browse function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
