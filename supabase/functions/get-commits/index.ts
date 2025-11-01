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

    const { accountId, repoFullName } = await req.json();

    if (!accountId || !repoFullName) {
      throw new Error('Missing required parameters');
    }

    console.log(`Fetching commits for ${repoFullName}`);

    // Get GitHub access token
    const { data: account, error: accountError } = await supabase
      .from('github_accounts')
      .select('access_token')
      .eq('id', accountId)
      .single();

    if (accountError) throw accountError;
    if (!account?.access_token) throw new Error('No access token found');

    // Fetch commits from GitHub
    const commitsResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/commits?per_page=10`,
      {
        headers: {
          'Authorization': `Bearer ${account.access_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Supabase-Functions',
        },
      }
    );

    // Handle empty repository (409 Conflict)
    if (commitsResponse.status === 409) {
      console.log(`Repository ${repoFullName} is empty, returning empty commits array`);
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!commitsResponse.ok) {
      const errorText = await commitsResponse.text();
      console.error('GitHub API error:', errorText);
      throw new Error(`GitHub API error: ${commitsResponse.statusText}`);
    }

    const commits = await commitsResponse.json();

    console.log(`Fetched ${commits.length} commits for ${repoFullName}`);

    return new Response(JSON.stringify(commits), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching commits:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
