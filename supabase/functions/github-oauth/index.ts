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

    const { code, userId } = await req.json();

    if (!code || !userId) {
      throw new Error("Missing code or userId");
    }

    // Exchange code for access token
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: Deno.env.get("GITHUB_CLIENT_ID"),
        client_secret: Deno.env.get("GITHUB_CLIENT_SECRET"),
        code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(tokenData.error_description || "Failed to get access token");
    }

    const accessToken = tokenData.access_token;

    // Get GitHub user info
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    const githubUser = await userResponse.json();

    // Store GitHub account in database
    const { data: existingAccount } = await supabaseClient
      .from("github_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("github_user_id", githubUser.id.toString())
      .maybeSingle();

    if (existingAccount) {
      // Update existing account
      await supabaseClient
        .from("github_accounts")
        .update({
          access_token: accessToken,
          avatar_url: githubUser.avatar_url,
          github_username: githubUser.login,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingAccount.id);
    } else {
      // Create new account
      await supabaseClient
        .from("github_accounts")
        .insert({
          user_id: userId,
          github_user_id: githubUser.id.toString(),
          github_username: githubUser.login,
          avatar_url: githubUser.avatar_url,
          access_token: accessToken,
        });
    }

    return new Response(
      JSON.stringify({ success: true, username: githubUser.login }),
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
