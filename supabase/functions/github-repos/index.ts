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

    const { accountId } = await req.json();

    if (!accountId) {
      throw new Error("Missing accountId");
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

    // Fetch repositories from GitHub
    const reposResponse = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
      headers: {
        Authorization: `Bearer ${account.access_token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!reposResponse.ok) {
      throw new Error("Failed to fetch repositories from GitHub");
    }

    const repos = await reposResponse.json();

    // Transform and return repositories
    const transformedRepos = repos.map((repo: any) => ({
      id: repo.id.toString(),
      github_id: repo.id.toString(),
      name: repo.name,
      full_name: repo.full_name,
      owner: repo.owner.login,
      description: repo.description,
      private: repo.private,
      default_branch: repo.default_branch,
      stars: repo.stargazers_count,
      updated_at: repo.updated_at,
    }));

    return new Response(
      JSON.stringify({ repos: transformedRepos }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
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
