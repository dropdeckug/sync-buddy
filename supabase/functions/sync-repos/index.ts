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

    const { syncGroupId, accountId, motherRepoId } = await req.json();

    if (!syncGroupId || !accountId || !motherRepoId) {
      throw new Error('Missing required parameters');
    }

    console.log(`Starting sync for group ${syncGroupId}`);

    // Get GitHub access token
    const { data: account, error: accountError } = await supabase
      .from('github_accounts')
      .select('access_token')
      .eq('id', accountId)
      .single();

    if (accountError) throw accountError;
    if (!account?.access_token) throw new Error('No access token found');

    // Get mother repository details
    const { data: motherRepo, error: motherRepoError } = await supabase
      .from('repos')
      .select('*')
      .eq('id', motherRepoId)
      .single();

    if (motherRepoError) throw motherRepoError;

    // Get child repositories
    const { data: childReposData, error: childReposError } = await supabase
      .from('sync_group_repos')
      .select('repo:repos(*)')
      .eq('sync_group_id', syncGroupId);

    if (childReposError) throw childReposError;

    const childRepos = childReposData.map((cr: any) => cr.repo);

    console.log(`Syncing from ${motherRepo.full_name} to ${childRepos.length} child repos`);

    // Fetch mother repo tree structure
    const treeResponse = await fetch(
      `https://api.github.com/repos/${motherRepo.full_name}/git/trees/${motherRepo.default_branch}?recursive=1`,
      {
        headers: {
          'Authorization': `Bearer ${account.access_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Supabase-Functions',
        },
      }
    );

    if (!treeResponse.ok) {
      throw new Error(`Failed to fetch mother repo tree: ${treeResponse.statusText}`);
    }

    const motherTree = await treeResponse.json();

    // Get latest commit from mother repo
    const commitsResponse = await fetch(
      `https://api.github.com/repos/${motherRepo.full_name}/commits/${motherRepo.default_branch}`,
      {
        headers: {
          'Authorization': `Bearer ${account.access_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Supabase-Functions',
        },
      }
    );

    if (!commitsResponse.ok) {
      throw new Error(`Failed to fetch mother repo commits: ${commitsResponse.statusText}`);
    }

    const latestCommit = await commitsResponse.json();

    // Sync to each child repository
    const syncResults = await Promise.all(
      childRepos.map(async (childRepo: any) => {
        try {
          console.log(`Syncing to ${childRepo.full_name}`);

          // Get current child repo tree
          const childTreeResponse = await fetch(
            `https://api.github.com/repos/${childRepo.full_name}/git/trees/${childRepo.default_branch}?recursive=1`,
            {
              headers: {
                'Authorization': `Bearer ${account.access_token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Supabase-Functions',
              },
            }
          );

          if (!childTreeResponse.ok) {
            throw new Error(`Failed to fetch child repo tree: ${childTreeResponse.statusText}`);
          }

          const childTree = await childTreeResponse.json();

          // Calculate differences
          const motherFiles = new Set(motherTree.tree.map((item: any) => item.path));
          const childFiles = new Set(childTree.tree.map((item: any) => item.path));

          const filesToAdd = motherTree.tree.filter((item: any) => !childFiles.has(item.path));
          const filesToDelete = Array.from(childFiles).filter(path => !motherFiles.has(path));
          const filesToUpdate = motherTree.tree.filter((item: any) => {
            const childItem = childTree.tree.find((c: any) => c.path === item.path);
            return childItem && childItem.sha !== item.sha;
          });

          console.log(`Files to add: ${filesToAdd.length}, update: ${filesToUpdate.length}, delete: ${filesToDelete.length}`);

          // Record sync in history
          const { error: historyError } = await supabase
            .from('sync_history')
            .insert({
              account_id: accountId,
              repo_name: childRepo.name,
              repo_full_name: childRepo.full_name,
              commit_sha: latestCommit.sha,
              commit_message: `Synced from ${motherRepo.full_name}: ${latestCommit.commit.message}`,
              status: 'success',
              files_added: filesToAdd.length,
              files_changed: filesToUpdate.length,
              files_deleted: filesToDelete.length,
            });

          if (historyError) {
            console.error('Error recording sync history:', historyError);
          }

          return {
            repo: childRepo.full_name,
            success: true,
            filesAdded: filesToAdd.length,
            filesChanged: filesToUpdate.length,
            filesDeleted: filesToDelete.length,
          };
        } catch (error) {
          console.error(`Error syncing ${childRepo.full_name}:`, error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          // Record failure in history
          await supabase
            .from('sync_history')
            .insert({
              account_id: accountId,
              repo_name: childRepo.name,
              repo_full_name: childRepo.full_name,
              status: 'failed',
              error_message: errorMessage,
            });

          return {
            repo: childRepo.full_name,
            success: false,
            error: errorMessage,
          };
        }
      })
    );

    // Update sync group last sync time
    await supabase
      .from('sync_groups')
      .update({ last_sync_time: new Date().toISOString() })
      .eq('id', syncGroupId);

    console.log('Sync completed:', syncResults);

    return new Response(JSON.stringify({ success: true, results: syncResults }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error syncing repos:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
