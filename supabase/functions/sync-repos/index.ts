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

    // Get child repositories first
    const { data: childReposData, error: childReposError } = await supabase
      .from('sync_group_repos')
      .select('repo:repos(*)')
      .eq('sync_group_id', syncGroupId);

    if (childReposError) throw childReposError;

    const childRepos = childReposData.map((cr: any) => cr.repo);

    console.log(`Checking sync status for ${childRepos.length} child repos`);

    // Check if mother repo has new commits
    const latestCommitResponse = await fetch(
      `https://api.github.com/repos/${motherRepo.full_name}/commits/${motherRepo.default_branch}`,
      {
        headers: {
          'Authorization': `Bearer ${account.access_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Supabase-Functions',
        },
      }
    );

    if (!latestCommitResponse.ok) {
      throw new Error(`Failed to fetch mother repo latest commit: ${latestCommitResponse.statusText}`);
    }

    const latestCommit = await latestCommitResponse.json();
    const latestCommitSha = latestCommit.sha;

    console.log(`Mother repo latest commit: ${latestCommitSha}`);

    // IMPORTANT: Check if ALL child repos are actually synced with this commit
    // Don't just check if we've seen this commit before
    let needsSync = false;
    
    for (const childRepo of childRepos) {
      try {
        const childCommitResponse = await fetch(
          `https://api.github.com/repos/${childRepo.full_name}/commits/${childRepo.default_branch}`,
          {
            headers: {
              'Authorization': `Bearer ${account.access_token}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Supabase-Functions',
            },
          }
        );

        if (childCommitResponse.ok) {
          const childCommit = await childCommitResponse.json();
          console.log(`Child repo ${childRepo.full_name} latest commit: ${childCommit.sha}`);
          
          // Check if child repo's latest commit message indicates it's synced
          const isSyncedCommit = childCommit.commit.message.includes(`Synced from ${motherRepo.full_name}`);
          const motherCommitInMessage = childCommit.commit.message.match(/Original commit SHA: ([a-f0-9]+)/);
          const syncedWithSha = motherCommitInMessage ? motherCommitInMessage[1] : null;
          
          if (!isSyncedCommit || syncedWithSha !== latestCommitSha) {
            console.log(`Child repo ${childRepo.full_name} is NOT synced with latest mother commit`);
            needsSync = true;
          } else {
            console.log(`Child repo ${childRepo.full_name} is already synced`);
          }
        } else {
          console.log(`Failed to fetch commit for ${childRepo.full_name}, will sync anyway`);
          needsSync = true;
        }
      } catch (error) {
        console.error(`Error checking ${childRepo.full_name}:`, error);
        needsSync = true;
      }
    }

    if (!needsSync) {
      console.log(`All child repos are already synced with mother repo commit ${latestCommitSha}`);
      
      // Update mother repo record with latest commit
      await supabase
        .from('repos')
        .update({ 
          last_commit_sha: latestCommitSha,
          last_commit_date: latestCommit.commit.author.date
        })
        .eq('id', motherRepoId);
        
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No new commits to sync',
          results: [] 
        }), 
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Starting sync from ${motherRepo.full_name} to ${childRepos.length} child repos`);
    console.log(`New commit detected: ${latestCommitSha} (previous: ${motherRepo.last_commit_sha})`);

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

          let childTree: any = { tree: [], sha: null };
          let isEmptyRepo = false;

          // Handle empty repository (409 Conflict)
          if (childTreeResponse.status === 409) {
            console.log(`Child repo ${childRepo.full_name} is empty, will initialize it`);
            isEmptyRepo = true;
          } else if (!childTreeResponse.ok) {
            throw new Error(`Failed to fetch child repo tree: ${childTreeResponse.statusText}`);
          } else {
            childTree = await childTreeResponse.json();
          }

          // Calculate differences
          const motherFiles = new Set(motherTree.tree.map((item: any) => item.path));
          const childFiles = new Set(childTree.tree.map((item: any) => item.path));

          // If repo is empty, treat all mother files as new additions
          const filesToAdd = isEmptyRepo 
            ? motherTree.tree.filter((item: any) => item.type === 'blob')
            : motherTree.tree.filter((item: any) => !childFiles.has(item.path) && item.type === 'blob');
          
          const filesToDelete = isEmptyRepo ? [] : Array.from(childFiles).filter(path => !motherFiles.has(path));
          
          const filesToUpdate = isEmptyRepo ? [] : motherTree.tree.filter((item: any) => {
            const childItem = childTree.tree.find((c: any) => c.path === item.path);
            return childItem && childItem.sha !== item.sha && item.type === 'blob';
          });

          console.log(`Files to add: ${filesToAdd.length}, update: ${filesToUpdate.length}, delete: ${filesToDelete.length}`);

          // If no changes, skip this repo
          if (filesToAdd.length === 0 && filesToUpdate.length === 0 && filesToDelete.length === 0) {
            console.log(`No changes needed for ${childRepo.full_name}`);
            return {
              repo: childRepo.full_name,
              success: true,
              filesAdded: 0,
              filesChanged: 0,
              filesDeleted: 0,
            };
          }

          // Step 1: Create blobs for new/updated files in child repo
          const filesToProcess = [...filesToAdd, ...filesToUpdate];
          console.log(`Creating blobs for ${filesToProcess.length} files`);
          
          const blobMap = new Map();
          
          for (const file of filesToProcess) {
            if (file.type === 'tree') continue; // Skip directories
            
            try {
              // Fetch blob content from mother repo
              const blobResponse = await fetch(
                `https://api.github.com/repos/${motherRepo.full_name}/git/blobs/${file.sha}`,
                {
                  headers: {
                    'Authorization': `Bearer ${account.access_token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Supabase-Functions',
                  },
                }
              );
              
              if (!blobResponse.ok) {
                console.error(`Failed to fetch blob ${file.sha} for ${file.path}: ${blobResponse.statusText}`);
                continue;
              }
              
              const blobData = await blobResponse.json();
              
              // Create blob in child repo with the fetched content
              const createBlobResponse = await fetch(
                `https://api.github.com/repos/${childRepo.full_name}/git/blobs`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${account.access_token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Supabase-Functions',
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    content: blobData.content,
                    encoding: blobData.encoding,
                  }),
                }
              );
              
              if (!createBlobResponse.ok) {
                const errorText = await createBlobResponse.text();
                console.error(`Failed to create blob for ${file.path}: ${createBlobResponse.statusText} - ${errorText}`);
                continue;
              }
              
              const newBlob = await createBlobResponse.json();
              blobMap.set(file.path, { sha: newBlob.sha, mode: file.mode });
              console.log(`Created blob for ${file.path}: ${newBlob.sha}`);
            } catch (blobError) {
              console.error(`Error processing blob for ${file.path}:`, blobError);
              continue;
            }
          }
          
          console.log(`Successfully created ${blobMap.size} blobs in child repo`);
          
          // Step 2: Build new tree structure using base_tree for efficiency
          // Only include changed/added files, let GitHub handle unchanged files
          const newTreeItems = [];
          
          // Add all new/updated files with their new blob SHAs
          for (const [path, blob] of blobMap.entries()) {
            newTreeItems.push({
              path: path,
              mode: blob.mode,
              type: 'blob',
              sha: blob.sha,
            });
          }
          
          // Mark files for deletion (null sha means delete)
          for (const path of filesToDelete) {
            newTreeItems.push({
              path: path,
              mode: '100644',
              type: 'blob',
              sha: null,
            });
          }

          // Step 3: Create new tree with base_tree to preserve unchanged files
          const baseTreeSha = isEmptyRepo ? undefined : childTree.sha;
          console.log(`Creating new tree with ${newTreeItems.length} changes (base tree: ${baseTreeSha || 'none - empty repo'})`);
          
          const treePayload: any = {
            tree: newTreeItems,
          };
          
          // Only include base_tree if repo is not empty
          if (baseTreeSha) {
            treePayload.base_tree = baseTreeSha;
          }
          
          const createTreeResponse = await fetch(
            `https://api.github.com/repos/${childRepo.full_name}/git/trees`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${account.access_token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Supabase-Functions',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(treePayload),
            }
          );

          if (!createTreeResponse.ok) {
            const errorText = await createTreeResponse.text();
            throw new Error(`Failed to create tree: ${createTreeResponse.statusText} - ${errorText}`);
          }

          const newTree = await createTreeResponse.json();
          console.log(`Created new tree: ${newTree.sha}`);

          // Step 4: Get the latest commit from child repo to use as parent (if not empty)
          let parentCommitSha = null;
          
          if (!isEmptyRepo) {
            const childCommitResponse = await fetch(
              `https://api.github.com/repos/${childRepo.full_name}/git/refs/heads/${childRepo.default_branch}`,
              {
                headers: {
                  'Authorization': `Bearer ${account.access_token}`,
                  'Accept': 'application/vnd.github.v3+json',
                  'User-Agent': 'Supabase-Functions',
                },
              }
            );

            if (!childCommitResponse.ok) {
              throw new Error(`Failed to get child repo ref: ${childCommitResponse.statusText}`);
            }

            const childRef = await childCommitResponse.json();
            parentCommitSha = childRef.object.sha;
          }

          // Step 5: Create commit with SHA for verification
          const commitMessage = `Synced from ${motherRepo.full_name}\n\nOriginal commit: ${latestCommit.commit.message}\nOriginal commit SHA: ${latestCommitSha}\nSynced files: +${filesToAdd.length} ~${filesToUpdate.length} -${filesToDelete.length}`;
          
          console.log(`Creating commit with message: ${commitMessage}`);
          const createCommitResponse = await fetch(
            `https://api.github.com/repos/${childRepo.full_name}/git/commits`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${account.access_token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Supabase-Functions',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                message: commitMessage,
                tree: newTree.sha,
                ...(parentCommitSha && { parents: [parentCommitSha] }),
              }),
            }
          );

          if (!createCommitResponse.ok) {
            const errorText = await createCommitResponse.text();
            throw new Error(`Failed to create commit: ${createCommitResponse.statusText} - ${errorText}`);
          }

          const newCommit = await createCommitResponse.json();
          console.log(`Created commit: ${newCommit.sha}`);

          // Step 6: Update or create branch reference
          console.log(`${isEmptyRepo ? 'Creating' : 'Updating'} ${childRepo.default_branch} branch to commit ${newCommit.sha}`);
          
          const refMethod = isEmptyRepo ? 'POST' : 'PATCH';
          const refUrl = isEmptyRepo 
            ? `https://api.github.com/repos/${childRepo.full_name}/git/refs`
            : `https://api.github.com/repos/${childRepo.full_name}/git/refs/heads/${childRepo.default_branch}`;
          
          const refBody = isEmptyRepo
            ? { ref: `refs/heads/${childRepo.default_branch}`, sha: newCommit.sha }
            : { sha: newCommit.sha };
          
          const updateRefResponse = await fetch(refUrl, {
              method: refMethod,
              headers: {
                'Authorization': `Bearer ${account.access_token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Supabase-Functions',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(refBody),
            }
          );

          if (!updateRefResponse.ok) {
            const errorText = await updateRefResponse.text();
            throw new Error(`Failed to update branch: ${updateRefResponse.statusText} - ${errorText}`);
          }

          console.log(`Successfully synced ${childRepo.full_name}`);

          // Record sync in history
          const { error: historyError } = await supabase
            .from('sync_history')
            .insert({
              account_id: accountId,
              repo_name: childRepo.name,
              repo_full_name: childRepo.full_name,
              commit_sha: newCommit.sha,
              commit_message: commitMessage,
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
