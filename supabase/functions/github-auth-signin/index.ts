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
    const { code } = await req.json();
    if (!code) throw new Error("Missing authorization code");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Exchange code for GitHub access token (with repo scope)
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: Deno.env.get("GITHUB_CLIENT_ID"),
        client_secret: Deno.env.get("GITHUB_CLIENT_SECRET"),
        code,
      }),
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }

    const accessToken = tokenData.access_token;
    if (!accessToken) throw new Error("No access token received");

    // Get GitHub user info + email
    const [userRes, emailsRes] = await Promise.all([
      fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "GitSync-App", Accept: "application/vnd.github.v3+json" },
      }),
      fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "GitSync-App", Accept: "application/vnd.github.v3+json" },
      }),
    ]);

    if (!userRes.ok) throw new Error("Failed to fetch GitHub user");
    const ghUser = await userRes.json();
    
    let email = ghUser.email;
    if (!email && emailsRes.ok) {
      const emails = await emailsRes.json();
      const primary = emails.find((e: any) => e.primary && e.verified);
      email = primary?.email || emails.find((e: any) => e.verified)?.email;
    }
    if (!email) throw new Error("No verified email found on GitHub account. Please make your email public or add a verified email.");

    console.log(`GitHub Auth: user=${ghUser.login}, email=${email}`);

    // Try to find existing user by email
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = users?.find((u: any) => u.email === email);

    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      userId = existingUser.id;
      console.log(`GitHub Auth: Found existing user ${userId}`);
    } else {
      // Create new user with a random password (they'll sign in via GitHub)
      const randomPwd = crypto.randomUUID() + crypto.randomUUID();
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: randomPwd,
        email_confirm: true,
        user_metadata: {
          github_username: ghUser.login,
          avatar_url: ghUser.avatar_url,
          full_name: ghUser.name || ghUser.login,
        },
      });
      if (createErr) throw new Error(`Failed to create user: ${createErr.message}`);
      userId = newUser.user.id;
      isNewUser = true;
      console.log(`GitHub Auth: Created new user ${userId}`);
    }

    // Store/update GitHub account with access token (repo permissions)
    const { data: existingAccount } = await supabaseAdmin
      .from("github_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("github_user_id", ghUser.id.toString())
      .maybeSingle();

    if (existingAccount) {
      await supabaseAdmin
        .from("github_accounts")
        .update({
          access_token: accessToken,
          avatar_url: ghUser.avatar_url || null,
          github_username: ghUser.login,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingAccount.id);
    } else {
      await supabaseAdmin
        .from("github_accounts")
        .insert({
          user_id: userId,
          github_user_id: ghUser.id.toString(),
          github_username: ghUser.login,
          avatar_url: ghUser.avatar_url || null,
          access_token: accessToken,
        });
    }

    // Generate a session for the user
    // We use generateLink to create a magic link token, then return a custom session approach
    // Actually, the best approach: sign in the user with admin-generated token
    const { data: sessionData, error: signInErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (signInErr) throw new Error(`Failed to generate session: ${signInErr.message}`);

    // Return the hashed token so the client can verify it via verifyOtp
    const token_hash = sessionData?.properties?.hashed_token;
    
    return new Response(
      JSON.stringify({
        success: true,
        token_hash,
        email,
        github_username: ghUser.login,
        is_new_user: isNewUser,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("GitHub Auth error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
