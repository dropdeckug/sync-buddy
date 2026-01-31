import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { accountId, repoFullName, path, content, commitMessage, sha } = await req.json();

    if (!accountId || !repoFullName || !path || content === undefined) {
      throw new Error('Missing required parameters: accountId, repoFullName, path, content');
    }

    // Get GitHub access token
    const { data: account, error: accountError } = await supabase
      .from('github_accounts')
      .select('access_token, github_username')
      .eq('id', accountId)
      .single();

    if (accountError) throw accountError;
    if (!account?.access_token) throw new Error('No access token found');

    // Encode content to base64
    const encodedContent = btoa(unescape(encodeURIComponent(content)));

    // Create or update file via GitHub API
    const response = await fetch(
      `https://api.github.com/repos/${repoFullName}/contents/${path}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${account.access_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Supabase-Functions',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: commitMessage || `Update ${path} via SyncHub`,
          content: encodedContent,
          sha: sha, // Required for updates
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`GitHub API error: ${errorData.message || response.statusText}`);
    }

    const result = await response.json();

    // Log the sync history
    await supabase.from('sync_history').insert({
      account_id: accountId,
      repo_name: repoFullName.split('/')[1],
      repo_full_name: repoFullName,
      status: 'success',
      commit_sha: result.commit.sha,
      commit_message: commitMessage || `Update ${path} via SyncHub`,
      files_changed: 1,
    });

    return new Response(
      JSON.stringify({
        success: true,
        commit: {
          sha: result.commit.sha,
          url: result.commit.html_url,
        },
        content: {
          sha: result.content.sha,
          path: result.content.path,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error saving file:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
