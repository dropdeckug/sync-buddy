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
    console.log("github-oauth: Starting account connect flow");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const { code, userId } = body;

    console.log(`github-oauth: userId=${userId}, code length=${code?.length ?? 0}`);

    if (!code || !userId) {
      throw new Error("Missing required fields: code and userId are both required");
    }

    // Exchange code for GitHub access token
    console.log("github-oauth: Exchanging code for access token...");
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
    console.log(`github-oauth: Token exchange HTTP status=${tokenResponse.status}`);

    let tokenData: any;
    try {
      tokenData = JSON.parse(tokenResponseText);
    } catch (_e) {
      console.error("github-oauth: Could not parse token response:", tokenResponseText);
      throw new Error("Invalid response from GitHub during token exchange. The code may have already been used or has expired — please try connecting again.");
    }

    if (tokenData.error) {
      console.error("github-oauth: Token error:", tokenData.error, tokenData.error_description);
      throw new Error(
        tokenData.error_description ||
        tokenData.error ||
        "GitHub refused the authorization code. It may have expired — please try connecting again."
      );
    }

    const accessToken = tokenData.access_token;
    if (!accessToken) {
      console.error("github-oauth: No access_token in response:", tokenData);
      throw new Error("GitHub did not return an access token. Please check that the GitHub OAuth App callback URL is set to your application URL and try again.");
    }

    console.log(`github-oauth: Got access token (prefix: ${accessToken.substring(0, 7)}...)`);

    // Fetch GitHub user info
    console.log("github-oauth: Fetching GitHub user info...");
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "GitSync-App",
      },
    });

    if (!userResponse.ok) {
      const errText = await userResponse.text();
      console.error("github-oauth: GitHub /user API error:", userResponse.status, errText);
      throw new Error(`Failed to fetch GitHub user info (HTTP ${userResponse.status}). The access token may be invalid.`);
    }

    const githubUser = await userResponse.json();
    console.log(`github-oauth: GitHub user: login=${githubUser.login}, id=${githubUser.id}`);

    if (!githubUser.login || !githubUser.id) {
      throw new Error("GitHub returned invalid user data. Please try again.");
    }

    // Upsert the github_accounts record
    console.log("github-oauth: Checking for existing account record...");
    const { data: existingAccount, error: selectError } = await supabaseClient
      .from("github_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("github_user_id", githubUser.id.toString())
      .maybeSingle();

    if (selectError) {
      console.error("github-oauth: DB select error:", selectError);
      throw new Error(`Database error while looking up account: ${selectError.message}`);
    }

    if (existingAccount) {
      console.log(`github-oauth: Updating existing account ${existingAccount.id}`);
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
        console.error("github-oauth: Update error:", updateError);
        throw new Error(`Failed to update GitHub account: ${updateError.message}`);
      }
    } else {
      console.log("github-oauth: Inserting new account record...");
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
        console.error("github-oauth: Insert error:", insertError);
        throw new Error(`Failed to save GitHub account: ${insertError.message}`);
      }
    }

    console.log(`github-oauth: Successfully connected @${githubUser.login} for user ${userId}`);

    return new Response(
      JSON.stringify({ success: true, username: githubUser.login }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("github-oauth: Final error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
