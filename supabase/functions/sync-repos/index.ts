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

// Fetch with retry for rate limits
async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Check for secondary rate limit (403 with specific message or 429)
      if (response.status === 403 || response.status === 429) {
        const body = await response.text();
        if (body.includes('secondary rate limit') || body.includes('abuse detection') || response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(30000, 2000 * Math.pow(2, attempt));
          console.log(`Rate limited, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
          await delay(waitTime);
          continue;
        }
        // Return the response for other 403 errors
        return new Response(body, { status: response.status, headers: response.headers });
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      const waitTime = Math.min(30000, 1000 * Math.pow(2, attempt));
      console.log(`Fetch error, waiting ${waitTime}ms before retry: ${error}`);
      await delay(waitTime);
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

// Process files in batches to avoid rate limits
async function processBlobsInBatches(
  files: any[],
  sourceRepoFullName: string,
  targetRepoFullName: string,
  accessToken: string,
  onProgress: (processed: number, currentFile: string) => Promise<void>,
  batchSize = 10,
  delayBetweenBatches = 2000
): Promise<Map<string, { sha: string; mode: string }>> {
  const blobMap = new Map<string, { sha: string; mode: string }>();
  
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    
    // Process batch concurrently
    const batchResults = await Promise.allSettled(
      batch.map(async (file) => {
        if (file.type === 'tree') return null;
        
        // Fetch blob content from source repo
        const blobResponse = await fetchWithRetry(
          `https://api.github.com/repos/${sourceRepoFullName}/git/blobs/${file.sha}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Supabase-Functions',
            },
          }
        );
        
        if (!blobResponse.ok) {
          console.error(`Failed to fetch blob ${file.sha} for ${file.path}: ${blobResponse.statusText}`);
          return null;
        }
        
        const blobData = await blobResponse.json();
        
        // Create new blob in target repo
        const createBlobResponse = await fetchWithRetry(
          `https://api.github.com/repos/${targetRepoFullName}/git/blobs`,
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
          const errorText = await createBlobResponse.text();
          console.error(`Failed to create blob for ${file.path}: ${errorText}`);
          return null;
        }
        
        const newBlob = await createBlobResponse.json();
        return { path: file.path, sha: newBlob.sha, mode: file.mode };
      })
    );
    
    // Collect successful results
    for (const result of batchResults) {
      if (result.status === 'fulfilled' && result.value) {
        blobMap.set(result.value.path, { sha: result.value.sha, mode: result.value.mode });
      }
    }
    
    // Report progress
    const processed = Math.min(i + batchSize, files.length);
    const lastFile = batch[batch.length - 1]?.path || '';
    await onProgress(processed, lastFile);
    
    // Add delay between batches to avoid secondary rate limits
    if (i + batchSize < files.length) {
      await delay(delayBetweenBatches);
    }
  }
  
  return blobMap;
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
      .lt('updated_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

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
        const commitResponse = await fetchWithRetry(
          `https://api.github.com/repos/${repo.full_name}/commits/${repo.default_branch}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Supabase-Functions',
            },
          }
        );

        if (!commitResponse.ok) {
          console.log(`Could not fetch commits for ${repo.full_name}: ${commitResponse.status}`);
          continue;
        }

        const latestCommit = await commitResponse.json();
        
        // Skip commits that are sync commits (to prevent infinite loops)
        const commitMessage = latestCommit.commit?.message || '';
        if (commitMessage.startsWith('Synced from ')) {
          console.log(`Skipping ${repo.full_name} - latest commit is a sync commit`);
          continue;
        }
        
        const commitDate = new Date(latestCommit.commit?.author?.date || 0);
        
        if (commitDate > latestCommitDate) {
          latestCommitDate = commitDate;
          sourceRepo = repo;
        }
      } catch (err) {
        console.log(`Error checking repo ${repo.full_name}:`, err);
      }
    }
    
    console.log(`Source repo (most recent changes): ${sourceRepo.full_name}`);
    
    // Get the latest commit from source repo
    const latestCommitResponse = await fetchWithRetry(
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
      throw new Error(`Failed to fetch latest commit: ${latestCommitResponse.statusText}`);
    }

    const latestCommit = await latestCommitResponse.json();
    const latestCommitSha = latestCommit.sha;
    const latestCommitMessage = latestCommit.commit?.message || 'No commit message';
    
    // Determine target repos (all repos except source)
    const targetRepos = allRepos.filter((r: any) => r.id !== sourceRepo.id);
    
    // Check if any target repos need syncing
    let needsSync = false;
    for (const target of targetRepos) {
      if (target.last_commit_sha !== latestCommitSha) {
        needsSync = true;
        break;
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
    const treeResponse = await fetchWithRetry(
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
        
        // Add a delay between repos to be nice to the API
        await delay(2000);
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
        const targetTreeResponse = await fetchWithRetry(
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

        // Process files in batches with retry logic
        const filesToProcess = [...filesToAdd, ...filesToUpdate];
        console.log(`Creating blobs for ${filesToProcess.length} files in ${targetRepo.full_name}`);
        
        const blobMap = await processBlobsInBatches(
          filesToProcess,
          sourceRepo.full_name,
          targetRepo.full_name,
          accessToken,
          async (processed, currentFile) => {
            if (progressId) {
              await supabase
                .from('sync_progress')
                .update({ 
                  current_file: currentFile,
                  files_processed: processed
                })
                .eq('id', progressId);
            }
          },
          10, // batch size
          3000 // delay between batches (3 seconds)
        );
        
        console.log(`Successfully created ${blobMap.size} blobs in target repo`);
        
        // Build tree items from created blobs
        const newTreeItems = [];
        for (const [path, blob] of blobMap.entries()) {
          newTreeItems.push({
            path: path,
            mode: blob.mode,
            type: 'blob',
            sha: blob.sha,
          });
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
        
        // Create new tree
        const baseTreeSha = isEmptyRepo ? undefined : targetTree.sha;
        console.log(`Creating new tree with ${newTreeItems.length} changes (base tree: ${baseTreeSha || 'none - empty repo'})`);
        
        const treePayload: any = {
          tree: newTreeItems,
        };
        
        if (baseTreeSha) {
          treePayload.base_tree = baseTreeSha;
        }
        
        const createTreeResponse = await fetchWithRetry(
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

        // Get parent commit for the new commit
        let parentSha: string | undefined;
        
        if (!isEmptyRepo) {
          const refResponse = await fetchWithRetry(
            `https://api.github.com/repos/${targetRepo.full_name}/git/refs/heads/${targetRepo.default_branch}`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Supabase-Functions',
              },
            }
          );
          
          if (refResponse.ok) {
            const refData = await refResponse.json();
            parentSha = refData.object?.sha;
          }
        }

        // Create commit with detailed message
        const filesChangedCount = filesToUpdate.length;
        const filesAddedCount = filesToAdd.length;
        const filesDeletedCount = filesToDelete.length;
        
        const commitMessage = `Synced from ${sourceRepo.full_name}\n\nOriginal commit: ${latestCommitMessage}\n\nX-Lovable-Edit-ID: ${latestCommit.commit?.message?.match(/X-Lovable-Edit-ID: ([^\n]+)/)?.[1] || 'unknown'}\nOriginal commit SHA: ${latestCommitSha}\nSynced files: +${filesAddedCount} ~${filesChangedCount} -${filesDeletedCount}`;
        
        console.log(`Creating commit with message: ${commitMessage}`);

        const commitPayload: any = {
          message: commitMessage,
          tree: newTree.sha,
        };
        
        if (parentSha) {
          commitPayload.parents = [parentSha];
        }

        const createCommitResponse = await fetchWithRetry(
          `https://api.github.com/repos/${targetRepo.full_name}/git/commits`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Supabase-Functions',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(commitPayload),
          }
        );

        if (!createCommitResponse.ok) {
          const errorText = await createCommitResponse.text();
          throw new Error(`Failed to create commit: ${createCommitResponse.statusText} - ${errorText}`);
        }

        const newCommit = await createCommitResponse.json();
        console.log(`Created commit: ${newCommit.sha}`);

        // Update branch reference
        console.log(`Updating ${targetRepo.default_branch} branch to commit ${newCommit.sha}`);
        
        if (isEmptyRepo) {
          // Create the branch for empty repos
          const createRefResponse = await fetchWithRetry(
            `https://api.github.com/repos/${targetRepo.full_name}/git/refs`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Supabase-Functions',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                ref: `refs/heads/${targetRepo.default_branch}`,
                sha: newCommit.sha,
              }),
            }
          );
          
          if (!createRefResponse.ok) {
            const errorText = await createRefResponse.text();
            throw new Error(`Failed to create branch: ${createRefResponse.statusText} - ${errorText}`);
          }
        } else {
          // Update existing branch
          const updateRefResponse = await fetchWithRetry(
            `https://api.github.com/repos/${targetRepo.full_name}/git/refs/heads/${targetRepo.default_branch}`,
            {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Supabase-Functions',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                sha: newCommit.sha,
                force: true,
              }),
            }
          );

          if (!updateRefResponse.ok) {
            const errorText = await updateRefResponse.text();
            throw new Error(`Failed to update branch: ${updateRefResponse.statusText} - ${errorText}`);
          }
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

        // Update target repo's last commit info
        await supabase
          .from('repos')
          .update({ 
            last_commit_sha: latestCommitSha,
            last_commit_date: latestCommit.commit.author.date
          })
          .eq('id', targetRepo.id);

        // Record in sync history
        await supabase
          .from('sync_history')
          .insert({
            account_id: accountId,
            repo_name: targetRepo.name,
            repo_full_name: targetRepo.full_name,
            commit_sha: newCommit.sha,
            commit_message: commitMessage.slice(0, 500),
            files_changed: filesChangedCount,
            files_added: filesAddedCount,
            files_deleted: filesDeletedCount,
            status: 'completed',
          });

        syncResults.push({
          repo: targetRepo.full_name,
          success: true,
          filesAdded: filesAddedCount,
          filesChanged: filesChangedCount,
          filesDeleted: filesDeletedCount,
        });

      } catch (repoError) {
        console.error(`Error syncing to ${targetRepo.full_name}:`, repoError);
        const errorMessage = repoError instanceof Error ? repoError.message : 'Unknown error';

        // Update progress to failed
        if (progressId) {
          await supabase
            .from('sync_progress')
            .update({ 
              status: 'failed',
              error_message: errorMessage
            })
            .eq('id', progressId);
        }

        // Record failure in history
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

    // Update source repo with latest commit
    await supabase
      .from('repos')
      .update({ 
        last_commit_sha: latestCommitSha,
        last_commit_date: latestCommit.commit.author.date
      })
      .eq('id', sourceRepo.id);

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
