import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
};

// Verify GitHub webhook signature
async function verifySignature(payload: string, signature: string | null): Promise<boolean> {
  const secret = Deno.env.get('GITHUB_WEBHOOK_SECRET');
  
  if (!secret) {
    console.warn('GITHUB_WEBHOOK_SECRET not configured, skipping signature validation');
    return true; // Allow if no secret configured (for backwards compatibility)
  }
  
  if (!signature) {
    console.error('No signature provided in request');
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const signatureArray = new Uint8Array(signatureBuffer);
    const computedSignature = 'sha256=' + Array.from(signatureArray)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Constant-time comparison to prevent timing attacks
    if (computedSignature.length !== signature.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < computedSignature.length; i++) {
      result |= computedSignature.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    
    return result === 0;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');
    
    // Verify webhook signature
    const isValid = await verifySignature(rawBody, signature);
    if (!isValid) {
      console.error('Invalid webhook signature');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const payload = JSON.parse(rawBody);
    
    // Only process push events
    const eventType = req.headers.get('x-github-event');
    if (eventType !== 'push') {
      console.log(`Ignoring non-push event: ${eventType}`);
      return new Response(JSON.stringify({ message: 'Ignored non-push event' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Extract repository info from payload
    const repoFullName = payload.repository?.full_name;
    const repoName = payload.repository?.name;
    const pusherName = payload.pusher?.name;
    const headCommit = payload.head_commit;
    
    if (!repoFullName) {
      console.error('No repository full_name in payload');
      return new Response(JSON.stringify({ error: 'Invalid payload' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    console.log(`Received push event for ${repoFullName}`);
    console.log(`Head commit: ${headCommit?.id} - ${headCommit?.message}`);

    // Check if this is a sync commit (to avoid infinite loops)
    if (headCommit?.message?.startsWith('Synced from ')) {
      console.log('Ignoring sync commit to prevent infinite loop');
      return new Response(JSON.stringify({ message: 'Ignored sync commit' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find the repository in our database
    const { data: repo, error: repoError } = await supabase
      .from('repos')
      .select('id, account_id, full_name')
      .eq('full_name', repoFullName)
      .single();

    if (repoError || !repo) {
      console.log(`Repository ${repoFullName} not found in database`);
      return new Response(JSON.stringify({ message: 'Repository not tracked' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log(`Found repository in database: ${repo.id}`);

    // Find sync groups that include this repository
    const { data: syncGroupRepos, error: sgError } = await supabase
      .from('sync_group_repos')
      .select('sync_group_id')
      .eq('repo_id', repo.id);

    if (sgError) {
      console.error('Error finding sync groups:', sgError);
      throw sgError;
    }

    // Also check if this repo is a mother repo in any sync group
    const { data: motherGroups, error: mgError } = await supabase
      .from('sync_groups')
      .select('id')
      .eq('mother_repo_id', repo.id);

    if (mgError) {
      console.error('Error finding mother groups:', mgError);
      throw mgError;
    }

    // Combine all sync group IDs
    const syncGroupIds = new Set<string>();
    syncGroupRepos?.forEach(sg => syncGroupIds.add(sg.sync_group_id));
    motherGroups?.forEach(mg => syncGroupIds.add(mg.id));

    if (syncGroupIds.size === 0) {
      console.log(`Repository ${repoFullName} is not part of any sync group`);
      return new Response(JSON.stringify({ message: 'Repository not in any sync group' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log(`Found ${syncGroupIds.size} sync group(s) for this repository`);

    // Get the GitHub access token for this account
    const { data: account, error: accountError } = await supabase
      .from('github_accounts')
      .select('access_token')
      .eq('id', repo.account_id)
      .single();

    if (accountError || !account) {
      console.error('Error getting GitHub account:', accountError);
      throw new Error('GitHub account not found');
    }

    // Trigger sync for each sync group
    const syncResults = [];
    for (const syncGroupId of syncGroupIds) {
      console.log(`Triggering sync for sync group: ${syncGroupId}`);
      
      try {
        // Call the sync-repos function
        const syncResponse = await fetch(`${supabaseUrl}/functions/v1/sync-repos`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            syncGroupId,
            accessToken: account.access_token,
          }),
        });

        const syncResult = await syncResponse.json();
        console.log(`Sync result for ${syncGroupId}:`, syncResult);
        
        syncResults.push({
          syncGroupId,
          success: syncResponse.ok,
          result: syncResult,
        });
      } catch (syncError: unknown) {
        const errorMessage = syncError instanceof Error ? syncError.message : 'Unknown error';
        console.error(`Error syncing group ${syncGroupId}:`, syncError);
        syncResults.push({
          syncGroupId,
          success: false,
          error: errorMessage,
        });
      }
    }

    return new Response(JSON.stringify({
      message: 'Webhook processed',
      repository: repoFullName,
      syncGroups: syncGroupIds.size,
      results: syncResults,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
