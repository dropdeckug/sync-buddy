import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limit tracking
interface RateLimitInfo {
  remaining: number;
  reset: number;
  limit: number;
}

function parseRateLimitHeaders(response: Response): RateLimitInfo {
  return {
    remaining: parseInt(response.headers.get('x-ratelimit-remaining') || '5000'),
    reset: parseInt(response.headers.get('x-ratelimit-reset') || '0'),
    limit: parseInt(response.headers.get('x-ratelimit-limit') || '5000'),
  };
}

async function checkRateLimit(accessToken: string): Promise<RateLimitInfo> {
  const response = await fetch('https://api.github.com/rate_limit', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Supabase-Functions',
    },
  });
  const data = await response.json();
  return {
    remaining: data.resources?.core?.remaining || 0,
    reset: data.resources?.core?.reset || 0,
    limit: data.resources?.core?.limit || 5000,
  };
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main sync function that runs in background
async function performSync(syncGroupId: string, accountId: string, supabase: any, accessToken: string) {
  try {
    console.log(`Starting background sync for group ${syncGroupId}`);
    
    // Check rate limit before starting
    const initialRateLimit = await checkRateLimit(accessToken);
    console.log(`Rate limit status: ${initialRateLimit.remaining}/${initialRateLimit.limit} remaining`);
    
    if (initialRateLimit.remaining < 100) {
      const resetTime = new Date(initialRateLimit.reset * 1000);
      throw new Error(`API rate limit too low (${initialRateLimit.remaining} remaining). Resets at ${resetTime.toISOString()}`);
    }

    // Clean up stale syncing records (older than 10 minutes)
    await supabase
      .from('sync_progress')
      .update({ status: 'failed', error_message: 'Sync timed out' })
      .eq('sync_group_id', syncGroupId)
      .eq('status', 'syncing')
      .lt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

    // Get sync group to find mother repo
    const { data: syncGroup, error: syncGroupError } = await supabase
      .from('sync_groups')
      .select('*, mother_repo:repos!sync_groups_mother_repo_id_fkey(*)')
      .eq('id', syncGroupId)
      .single();

    if (syncGroupError) throw syncGroupError;

    // Get all child repositories
    const { data: childReposData, error: childReposError } = await supabase
      .from('sync_group_repos')
      .select('repo:repos(*)')
      .eq('sync_group_id', syncGroupId);

    if (childReposError) throw childReposError;

    const childRepos = childReposData.map((cr: any) => cr.repo);
    
    // Combine mother and child repos to find the one with most recent commit
    const allRepos = [syncGroup.mother_repo, ...childRepos];
    
    console.log(`Checking ${allRepos.length} repositories for most recent commit`);
    
    // Find repository with most recent non-sync commit
    let sourceRepo = syncGroup.mother_repo;
    let latestCommitDate = new Date(0);
    
    for (const repo of allRepos) {
      try {
        const commitResponse = await fetch(
          `https://api.github.com/repos/${repo.full_name}/commits/${repo.default_branch}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Supabase-Functions',
            },
          }
        );

        if (commitResponse.ok) {
          const commit = await commitResponse.json();
          const commitDate = new Date(commit.commit.author.date);
          
          // Skip if this is a sync commit
          const isSyncCommit = commit.commit.message.includes('Synced from');
          
          if (!isSyncCommit && commitDate > latestCommitDate) {
            latestCommitDate = commitDate;
            sourceRepo = repo;
          }
        }
      } catch (error) {
        console.error(`Error checking commits for ${repo.full_name}:`, error);
      }
    }
    
    console.log(`Source repository determined: ${sourceRepo.full_name} (most recent commit: ${latestCommitDate.toISOString()})`);
    
    // Update sync group mother repo if it changed
    if (sourceRepo.id !== syncGroup.mother_repo_id) {
      console.log(`Updating mother repo from ${syncGroup.mother_repo.full_name} to ${sourceRepo.full_name}`);
      await supabase
        .from('sync_groups')
        .update({ mother_repo_id: sourceRepo.id })
        .eq('id', syncGroupId);
    }
    
    // Get target repos (all repos except the source)
    const targetRepos = allRepos.filter(r => r.id !== sourceRepo.id);

    console.log(`Checking sync status for ${targetRepos.length} target repos`);

    // Get source repo latest commit
    const latestCommitResponse = await fetch(
      `https://api.github.com/repos/${sourceRepo.full_name}/commits/${sourceRepo.default_branch}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Supabase-Functions',
        },
      }
    );

    if (!latestCommitResponse.ok) {
      throw new Error(`Failed to fetch source repo latest commit: ${latestCommitResponse.statusText}`);
    }

    const latestCommit = await latestCommitResponse.json();
    const latestCommitSha = latestCommit.sha;

    console.log(`Source repo latest commit: ${latestCommitSha}`);

    // Check if ALL target repos are already synced with this commit
    let needsSync = false;
    
    for (const targetRepo of targetRepos) {
      try {
        const targetCommitResponse = await fetch(
          `https://api.github.com/repos/${targetRepo.full_name}/commits/${targetRepo.default_branch}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Supabase-Functions',
            },
          }
        );

        if (targetCommitResponse.ok) {
          const targetCommit = await targetCommitResponse.json();
          console.log(`Target repo ${targetRepo.full_name} latest commit: ${targetCommit.sha}`);
          
          // Check if target repo's latest commit message indicates it's synced
          const isSyncedCommit = targetCommit.commit.message.includes(`Synced from ${sourceRepo.full_name}`);
          const sourceCommitInMessage = targetCommit.commit.message.match(/Original commit SHA: ([a-f0-9]+)/);
          const syncedWithSha = sourceCommitInMessage ? sourceCommitInMessage[1] : null;
          
          if (!isSyncedCommit || syncedWithSha !== latestCommitSha) {
            console.log(`Target repo ${targetRepo.full_name} is NOT synced with latest source commit`);
            needsSync = true;
          } else {
            console.log(`Target repo ${targetRepo.full_name} is already synced`);
          }
        } else {
          console.log(`Failed to fetch commit for ${targetRepo.full_name}, will sync anyway`);
          needsSync = true;
        }
      } catch (error) {
        console.error(`Error checking ${targetRepo.full_name}:`, error);
        needsSync = true;
      }
    }

    if (!needsSync) {
      console.log(`All target repos are already synced with source repo commit ${latestCommitSha}`);
      
      // Update source repo record with latest commit
      await supabase
        .from('repos')
        .update({ 
          last_commit_sha: latestCommitSha,
          last_commit_date: latestCommit.commit.author.date
        })
        .eq('id', sourceRepo.id);
        
      return { 
        success: true, 
        message: 'No new commits to sync',
        sourceRepo: sourceRepo.full_name,
        results: [] 
      };
    }

    console.log(`Starting sync from ${sourceRepo.full_name} to ${targetRepos.length} target repos`);
    console.log(`New commit detected: ${latestCommitSha}`);

    // Fetch source repo tree structure
    const treeResponse = await fetch(
      `https://api.github.com/repos/${sourceRepo.full_name}/git/trees/${sourceRepo.default_branch}?recursive=1`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Supabase-Functions',
        },
      }
    );

    if (!treeResponse.ok) {
      throw new Error(`Failed to fetch source repo tree: ${treeResponse.statusText}`);
    }

    const sourceTree = await treeResponse.json();

    // Sync to each target repository SEQUENTIALLY to avoid rate limits
    const syncResults = [];
    
    for (let i = 0; i < targetRepos.length; i++) {
      const targetRepo = targetRepos[i];
      
      // Check rate limit before each repo
      if (i > 0) {
        const currentRateLimit = await checkRateLimit(accessToken);
        console.log(`Rate limit before ${targetRepo.full_name}: ${currentRateLimit.remaining}/${currentRateLimit.limit}`);
        
        if (currentRateLimit.remaining < 50) {
          console.log(`Rate limit too low, pausing sync. Will resume when rate limit resets.`);
          
          // Mark remaining repos as rate-limited
          for (let j = i; j < targetRepos.length; j++) {
            await supabase
              .from('sync_progress')
              .insert({
                sync_group_id: syncGroupId,
                account_id: accountId,
                source_repo_name: sourceRepo.name,
                source_repo_full_name: sourceRepo.full_name,
                target_repo_name: targetRepos[j].name,
                target_repo_full_name: targetRepos[j].full_name,
                status: 'failed',
                error_message: `Rate limit exceeded. Resets at ${new Date(currentRateLimit.reset * 1000).toISOString()}`,
              });
            
            syncResults.push({
              repo: targetRepos[j].full_name,
              success: false,
              error: 'Rate limit exceeded',
            });
          }
          break;
        }
        
        // Add a small delay between repos to be nice to the API
        await delay(1000);
      }
      
      let progressId: string | undefined;
      try {
        console.log(`Syncing to ${targetRepo.full_name} (${i + 1}/${targetRepos.length})`);
        
        // Create initial progress record
        const { data: progressRecord } = await supabase
          .from('sync_progress')
          .insert({
            sync_group_id: syncGroupId,
            account_id: accountId,
            source_repo_name: sourceRepo.name,
            source_repo_full_name: sourceRepo.full_name,
            target_repo_name: targetRepo.name,
            target_repo_full_name: targetRepo.full_name,
            status: 'syncing',
            files_processed: 0,
            total_files: 0,
          })
          .select()
          .single();
        
        progressId = progressRecord?.id;

        // Get current target repo tree
        const targetTreeResponse = await fetch(
          `https://api.github.com/repos/${targetRepo.full_name}/git/trees/${targetRepo.default_branch}?recursive=1`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Supabase-Functions',
            },
          }
        );

        let targetTree: any = { tree: [], sha: null };
        let isEmptyRepo = false;

        // Handle empty repository (409 Conflict)
        if (targetTreeResponse.status === 409) {
          console.log(`Target repo ${targetRepo.full_name} is empty, will initialize it`);
          isEmptyRepo = true;
        } else if (!targetTreeResponse.ok) {
          throw new Error(`Failed to fetch target repo tree: ${targetTreeResponse.statusText}`);
        } else {
          targetTree = await targetTreeResponse.json();
        }

        // Calculate differences
        const sourceFiles = new Set(sourceTree.tree.map((item: any) => item.path));
        const targetFiles = new Set(targetTree.tree.map((item: any) => item.path));

        // If repo is empty, treat all source files as new additions
        const filesToAdd = isEmptyRepo 
          ? sourceTree.tree.filter((item: any) => item.type === 'blob')
          : sourceTree.tree.filter((item: any) => !targetFiles.has(item.path) && item.type === 'blob');
        
        const filesToDelete = isEmptyRepo ? [] : Array.from(targetFiles).filter(path => !sourceFiles.has(path));
        
        const filesToUpdate = isEmptyRepo ? [] : sourceTree.tree.filter((item: any) => {
          const targetItem = targetTree.tree.find((c: any) => c.path === item.path);
          return targetItem && targetItem.sha !== item.sha && item.type === 'blob';
        });

        const totalFiles = filesToAdd.length + filesToUpdate.length + filesToDelete.length;
        console.log(`Files to add: ${filesToAdd.length}, update: ${filesToUpdate.length}, delete: ${filesToDelete.length}`);
        
        // Update progress with total files
        if (progressId) {
          await supabase
            .from('sync_progress')
            .update({ total_files: totalFiles })
            .eq('id', progressId);
        }

        // If no changes, skip this repo
        if (totalFiles === 0) {
          console.log(`No changes needed for ${targetRepo.full_name}`);
          if (progressId) {
            await supabase
              .from('sync_progress')
              .update({ status: 'completed' })
              .eq('id', progressId);
          }
          syncResults.push({
            repo: targetRepo.full_name,
            success: true,
            filesAdded: 0,
            filesChanged: 0,
            filesDeleted: 0,
          });
          continue;
        }

        // For empty repos or same-owner repos, use blob SHAs directly (optimization)
        const sameOwner = sourceRepo.owner === targetRepo.owner;
        let newTreeItems = [];
        let filesProcessed = 0;
        
        if (isEmptyRepo || sameOwner) {
          console.log(`${isEmptyRepo ? 'Empty repo' : 'Same owner'}: Using source repo blob SHAs directly`);
          
          // For additions and updates, we can use the source blob SHA directly
          for (const file of [...filesToAdd, ...filesToUpdate]) {
            if (file.type === 'tree') continue;
            newTreeItems.push({
              path: file.path,
              mode: file.mode,
              type: 'blob',
              sha: file.sha,
            });
            filesProcessed++;
            
            // Update progress periodically
            if (progressId && filesProcessed % 50 === 0) {
              await supabase
                .from('sync_progress')
                .update({ 
                  current_file: file.path,
                  files_processed: filesProcessed
                })
                .eq('id', progressId);
            }
          }
          
          // Handle deletions
          for (const path of filesToDelete) {
            newTreeItems.push({
              path: path,
              mode: '100644',
              type: 'blob',
              sha: null,
            });
          }
        } else {
          console.log(`Different owners: Creating new blobs for ${filesToAdd.length + filesToUpdate.length} files`);
          
          const filesToProcess = [...filesToAdd, ...filesToUpdate];
          const blobMap = new Map();
          
          for (const file of filesToProcess) {
            if (file.type === 'tree') continue;
            
            try {
              // Update progress with current file
              if (progressId) {
                await supabase
                  .from('sync_progress')
                  .update({ 
                    current_file: file.path,
                    files_processed: filesProcessed
                  })
                  .eq('id', progressId);
              }
              
              const blobResponse = await fetch(
                `https://api.github.com/repos/${sourceRepo.full_name}/git/blobs/${file.sha}`,
                {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Supabase-Functions',
                  },
                }
              );
              
              if (!blobResponse.ok) {
                console.error(`Failed to fetch blob ${file.sha} for ${file.path}`);
                continue;
              }
              
              const blobData = await blobResponse.json();
              
              const createBlobResponse = await fetch(
                `https://api.github.com/repos/${targetRepo.full_name}/git/blobs`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
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
                console.error(`Failed to create blob for ${file.path}`);
                continue;
              }
              
              const newBlob = await createBlobResponse.json();
              blobMap.set(file.path, { sha: newBlob.sha, mode: file.mode });
              filesProcessed++;
            } catch (blobError) {
              console.error(`Error processing blob for ${file.path}:`, blobError);
              continue;
            }
          }
          
          console.log(`Successfully created ${blobMap.size} blobs`);
          
          for (const [path, blob] of blobMap.entries()) {
            newTreeItems.push({
              path: path,
              mode: blob.mode,
              type: 'blob',
              sha: blob.sha,
            });
          }
          
          for (const path of filesToDelete) {
            newTreeItems.push({
              path: path,
              mode: '100644',
              type: 'blob',
              sha: null,
            });
          }
        }
        
        // Create new tree
        const baseTreeSha = isEmptyRepo ? undefined : targetTree.sha;
        console.log(`Creating new tree with ${newTreeItems.length} changes (base tree: ${baseTreeSha || 'none - empty repo'})`);
        
        const treePayload: any = {
          tree: newTreeItems,
        };
        
        if (baseTreeSha) {
          treePayload.base_tree = baseTreeSha;
        }
        
        const createTreeResponse = await fetch(
          `https://api.github.com/repos/${targetRepo.full_name}/git/trees`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
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

        // Get the latest commit from target repo to use as parent (if not empty)
        let parentCommitSha = null;
        
        if (!isEmptyRepo) {
          const targetCommitResponse = await fetch(
            `https://api.github.com/repos/${targetRepo.full_name}/git/refs/heads/${targetRepo.default_branch}`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Supabase-Functions',
              },
            }
          );

          if (!targetCommitResponse.ok) {
            throw new Error(`Failed to get target repo ref: ${targetCommitResponse.statusText}`);
          }

          const targetRef = await targetCommitResponse.json();
          parentCommitSha = targetRef.object.sha;
        }

        // Create commit with SHA for verification
        const commitMessage = `Synced from ${sourceRepo.full_name}\n\nOriginal commit: ${latestCommit.commit.message}\nOriginal commit SHA: ${latestCommitSha}\nSynced files: +${filesToAdd.length} ~${filesToUpdate.length} -${filesToDelete.length}`;
        
        console.log(`Creating commit with message: ${commitMessage}`);
        
        const createCommitResponse = await fetch(
          `https://api.github.com/repos/${targetRepo.full_name}/git/commits`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
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

        // Update or create branch reference
        console.log(`${isEmptyRepo ? 'Creating' : 'Updating'} ${targetRepo.default_branch} branch to commit ${newCommit.sha}`);
        
        const refMethod = isEmptyRepo ? 'POST' : 'PATCH';
        const refUrl = isEmptyRepo 
          ? `https://api.github.com/repos/${targetRepo.full_name}/git/refs`
          : `https://api.github.com/repos/${targetRepo.full_name}/git/refs/heads/${targetRepo.default_branch}`;
        
        const refBody = isEmptyRepo
          ? { ref: `refs/heads/${targetRepo.default_branch}`, sha: newCommit.sha }
          : { sha: newCommit.sha };
        
        const updateRefResponse = await fetch(refUrl, {
            method: refMethod,
            headers: {
              'Authorization': `Bearer ${accessToken}`,
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

        console.log(`Successfully synced ${targetRepo.full_name}`);
        
        // Update progress to completed
        if (progressId) {
          await supabase
            .from('sync_progress')
            .update({ 
              status: 'completed',
              files_processed: totalFiles 
            })
            .eq('id', progressId);
        }

        // Record sync in history
        const { error: historyError } = await supabase
          .from('sync_history')
          .insert({
            account_id: accountId,
            repo_name: targetRepo.name,
            repo_full_name: targetRepo.full_name,
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

        syncResults.push({
          repo: targetRepo.full_name,
          success: true,
          filesAdded: filesToAdd.length,
          filesChanged: filesToUpdate.length,
          filesDeleted: filesToDelete.length,
        });
      } catch (error) {
        console.error(`Error syncing ${targetRepo.full_name}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        if (progressId) {
          await supabase
            .from('sync_progress')
            .update({ 
              status: 'failed',
              error_message: errorMessage 
            })
            .eq('id', progressId);
        }

        await supabase
          .from('sync_history')
          .insert({
            account_id: accountId,
            repo_name: targetRepo.name,
            repo_full_name: targetRepo.full_name,
            status: 'failed',
            error_message: errorMessage,
          });

        syncResults.push({
          repo: targetRepo.full_name,
          success: false,
          error: errorMessage,
        });
      }
    }

    // Update sync group last sync time
    await supabase
      .from('sync_groups')
      .update({ last_sync_time: new Date().toISOString() })
      .eq('id', syncGroupId);

    console.log('Background sync completed:', syncResults);
    
    // Clean up old progress records (keep only last 100)
    const { data: oldProgress } = await supabase
      .from('sync_progress')
      .select('id')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .range(100, 1000);
    
    if (oldProgress && oldProgress.length > 0) {
      await supabase
        .from('sync_progress')
        .delete()
        .in('id', oldProgress.map((p: any) => p.id));
    }

    return { 
      success: true, 
      sourceRepo: sourceRepo.full_name,
      results: syncResults 
    };
  } catch (error) {
    console.error('Background sync error:', error);
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { syncGroupId, accountId } = await req.json();

    if (!syncGroupId || !accountId) {
      throw new Error('Missing required parameters');
    }

    console.log(`Received sync request for group ${syncGroupId}`);

    // Get GitHub access token
    const { data: account, error: accountError } = await supabase
      .from('github_accounts')
      .select('access_token')
      .eq('id', accountId)
      .single();

    if (accountError) throw accountError;
    if (!account?.access_token) throw new Error('No access token found');

    // Use EdgeRuntime.waitUntil to run sync in background
    // @ts-ignore - EdgeRuntime is available in Deno Deploy
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      console.log('Running sync in background using EdgeRuntime.waitUntil');
      // @ts-ignore
      EdgeRuntime.waitUntil(performSync(syncGroupId, accountId, supabase, account.access_token));
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Sync started in background',
        syncGroupId 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // Fallback for environments without EdgeRuntime (run synchronously)
      console.log('EdgeRuntime not available, running sync synchronously');
      const result = await performSync(syncGroupId, accountId, supabase, account.access_token);
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Error initiating sync:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
