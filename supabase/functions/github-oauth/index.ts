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
    console.log("GitHub OAuth: Starting OAuth flow");
    
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { code, userId } = await req.json();
    console.log(`GitHub OAuth: Received request for userId=${userId}, code length=${code?.length || 0}`);

    if (!code || !userId) {
      console.error("GitHub OAuth: Missing code or userId");
      throw new Error("Missing code or userId");
    }

    // Exchange code for access token
    console.log("GitHub OAuth: Exchanging code for access token...");
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

    const tokenResponseText = await tokenResponse.text();
    console.log(`GitHub OAuth: Token response status=${tokenResponse.status}`);
    
    let tokenData;
    try {
      tokenData = JSON.parse(tokenResponseText);
    } catch (e) {
      console.error("GitHub OAuth: Failed to parse token response:", tokenResponseText);
      throw new Error("Invalid response from GitHub token exchange");
    }

    if (tokenData.error) {
      console.error("GitHub OAuth: Token error:", tokenData.error, tokenData.error_description);
      throw new Error(tokenData.error_description || tokenData.error || "Failed to get access token");
    }

    const accessToken = tokenData.access_token;
    
    if (!accessToken || !accessToken.startsWith('gho_')) {
      console.error("GitHub OAuth: Invalid access token format:", accessToken?.substring(0, 10));
      throw new Error("Invalid access token received from GitHub");
    }
    
    console.log("GitHub OAuth: Successfully obtained access token");

    // Get GitHub user info
    console.log("GitHub OAuth: Fetching user info...");
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Supabase-Functions",
      },
    });

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error("GitHub OAuth: Failed to get user info:", userResponse.status, errorText);
      throw new Error(`Failed to get GitHub user info: ${userResponse.statusText}`);
    }

    const githubUser = await userResponse.json();
    console.log(`GitHub OAuth: Got user info - login=${githubUser.login}, id=${githubUser.id}`);

    if (!githubUser.login || !githubUser.id) {
      console.error("GitHub OAuth: Invalid user data:", githubUser);
      throw new Error("Invalid GitHub user data received");
    }

    // Store GitHub account in database
    console.log("GitHub OAuth: Checking for existing account...");
    const { data: existingAccount, error: selectError } = await supabaseClient
      .from("github_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("github_user_id", githubUser.id.toString())
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      console.error("GitHub OAuth: Error checking existing account:", selectError);
    }

    if (existingAccount) {
      console.log(`GitHub OAuth: Updating existing account ${existingAccount.id}`);
      const { error: updateError } = await supabaseClient
        .from("github_accounts")
        .update({
          access_token: accessToken,
          avatar_url: githubUser.avatar_url || null,
          github_username: githubUser.login,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingAccount.id);
      
      if (updateError) {
        console.error("GitHub OAuth: Update error:", updateError);
        throw new Error(`Failed to update account: ${updateError.message}`);
      }
    } else {
      console.log("GitHub OAuth: Creating new account...");
      const { error: insertError } = await supabaseClient
        .from("github_accounts")
        .insert({
          user_id: userId,
          github_user_id: githubUser.id.toString(),
          github_username: githubUser.login,
          avatar_url: githubUser.avatar_url || null,
          access_token: accessToken,
        });
      
      if (insertError) {
        console.error("GitHub OAuth: Insert error:", insertError);
        throw new Error(`Failed to create account: ${insertError.message}`);
      }
    }

    console.log(`GitHub OAuth: Successfully connected account for ${githubUser.login}`);
    
    return new Response(
      JSON.stringify({ success: true, username: githubUser.login }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("GitHub OAuth: Final error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
