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

    if (!syncGroupId || !accountId) {
      throw new Error('Missing required parameters');
    }

    console.log(`Starting bidirectional sync for group ${syncGroupId}`);

    // Get GitHub access token
    const { data: account, error: accountError } = await supabase
      .from('github_accounts')
      .select('access_token')
      .eq('id', accountId)
      .single();

    if (accountError) throw accountError;
    if (!account?.access_token) throw new Error('No access token found');

    // Get ALL repositories in the sync group (mother + children)
    const { data: syncGroupRepos, error: syncGroupReposError } = await supabase
      .from('sync_group_repos')
      .select('repo:repos(*)')
      .eq('sync_group_id', syncGroupId);

    if (syncGroupReposError) throw syncGroupReposError;

    const allRepos = syncGroupRepos.map((sgr: any) => sgr.repo);

    if (allRepos.length === 0) {
      throw new Error('No repositories found in sync group');
    }

    console.log(`Found ${allRepos.length} repositories in sync group`);

    // Fetch latest commit info for ALL repos
    const repoCommitInfo = await Promise.all(
      allRepos.map(async (repo: any) => {
        try {
          const commitResponse = await fetch(
            `https://api.github.com/repos/${repo.full_name}/commits/${repo.default_branch}`,
            {
              headers: {
                'Authorization': `Bearer ${account.access_token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Supabase-Functions',
              },
            }
          );

          if (!commitResponse.ok) {
            console.log(`Could not fetch commit for ${repo.full_name} (may be empty)`);
            return { repo, commit: null, commitDate: null };
          }

          const commit = await commitResponse.json();
          const commitDate = new Date(commit.commit.author.date);
          
          console.log(`${repo.full_name}: Latest commit ${commit.sha} at ${commitDate.toISOString()}`);
          
          return { repo, commit, commitDate };
        } catch (error) {
          console.error(`Error fetching commit for ${repo.full_name}:`, error);
          return { repo, commit: null, commitDate: null };
        }
      })
    );

    // Filter out repos without commits and find the one with the newest commit
    const reposWithCommits = repoCommitInfo.filter(info => info.commit !== null);
    
    if (reposWithCommits.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No repositories with commits found',
          results: [] 
        }), 
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Find the repo with the most recent commit (becomes temporary source)
    const sourceRepoInfo = reposWithCommits.reduce((latest, current) => {
      if (!latest.commitDate || (current.commitDate && current.commitDate > latest.commitDate)) {
        return current;
      }
      return latest;
    });

    const sourceRepo = sourceRepoInfo.repo;
    const sourceCommit = sourceRepoInfo.commit;
    
    console.log(`Source repository (newest commit): ${sourceRepo.full_name}`);
    console.log(`Source commit: ${sourceCommit.sha} at ${sourceRepoInfo.commitDate?.toISOString()}`);

    // Check if source commit is a sync commit to avoid circular syncing
    const isSyncCommit = sourceCommit.commit.message.includes('Synced from');
    const originalCommitMatch = sourceCommit.commit.message.match(/Original commit SHA: ([a-f0-9]+)/);
    const originalCommitSha = originalCommitMatch ? originalCommitMatch[1] : sourceCommit.sha;

    console.log(`Is sync commit: ${isSyncCommit}, Original SHA: ${originalCommitSha}`);

    // Target repos are all repos EXCEPT the source
    const targetRepos = allRepos.filter((repo: any) => repo.id !== sourceRepo.id);
    
    console.log(`Will sync to ${targetRepos.length} target repositories`);

    // Check if any target repos need syncing
    let needsSync = false;
    
    for (const targetRepo of targetRepos) {
      const targetInfo = repoCommitInfo.find(info => info.repo.id === targetRepo.id);
      
      if (!targetInfo?.commit) {
        console.log(`Target repo ${targetRepo.full_name} has no commits, needs sync`);
        needsSync = true;
        continue;
      }

      // Check if target is already synced with this exact commit
      const targetCommitMessage = targetInfo.commit.commit.message;
      const isAlreadySynced = targetCommitMessage.includes(`Synced from ${sourceRepo.full_name}`) &&
                             targetCommitMessage.includes(`Original commit SHA: ${originalCommitSha}`);
      
      if (!isAlreadySynced) {
        console.log(`Target repo ${targetRepo.full_name} needs sync`);
        needsSync = true;
      } else {
        console.log(`Target repo ${targetRepo.full_name} is already synced`);
      }
    }

    if (!needsSync) {
      console.log(`All repositories are already synced`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'All repositories are already synced',
          results: [] 
        }), 
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Fetch source repo tree structure
    const treeResponse = await fetch(
      `https://api.github.com/repos/${sourceRepo.full_name}/git/trees/${sourceRepo.default_branch}?recursive=1`,
      {
        headers: {
          'Authorization': `Bearer ${account.access_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Supabase-Functions',
        },
      }
    );

    if (!treeResponse.ok) {
      throw new Error(`Failed to fetch source repo tree: ${treeResponse.statusText}`);
    }

    const sourceTree = await treeResponse.json();

    // Sync to each target repository
    const syncResults = await Promise.all(
      targetRepos.map(async (targetRepo: any) => {
        try {
          console.log(`Syncing to ${targetRepo.full_name}`);

          // Get current target repo tree
          const targetTreeResponse = await fetch(
            `https://api.github.com/repos/${targetRepo.full_name}/git/trees/${targetRepo.default_branch}?recursive=1`,
            {
              headers: {
                'Authorization': `Bearer ${account.access_token}`,
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

          console.log(`Files to add: ${filesToAdd.length}, update: ${filesToUpdate.length}, delete: ${filesToDelete.length}`);

          // If no changes, skip this repo
          if (filesToAdd.length === 0 && filesToUpdate.length === 0 && filesToDelete.length === 0) {
            console.log(`No changes needed for ${targetRepo.full_name}`);
            return {
              repo: targetRepo.full_name,
              success: true,
              filesAdded: 0,
              filesChanged: 0,
              filesDeleted: 0,
            };
          }

          // For empty repos, use the source repo tree directly
          // GitHub doesn't allow creating blobs in empty repos, so we build the tree from source's SHAs
          let newTreeItems = [];
          
          if (isEmptyRepo) {
            console.log(`Empty repo: Using source repo tree structure directly`);
            // For empty repo, create tree structure using source repo's blob SHAs directly
            newTreeItems = sourceTree.tree
              .filter((item: any) => item.type === 'blob')
              .map((item: any) => ({
                path: item.path,
                mode: item.mode,
                type: 'blob',
                sha: item.sha, // Use source repo's SHA directly - blobs are content-addressable
              }));
          } else {
            // For existing repos, need to create new blobs and build tree
            console.log(`Existing repo: Creating new blobs for ${filesToAdd.length + filesToUpdate.length} files`);
            
            const filesToProcess = [...filesToAdd, ...filesToUpdate];
            const blobMap = new Map();
            
            for (const file of filesToProcess) {
              if (file.type === 'tree') continue;
              
              try {
                const blobResponse = await fetch(
                  `https://api.github.com/repos/${sourceRepo.full_name}/git/blobs/${file.sha}`,
                  {
                    headers: {
                      'Authorization': `Bearer ${account.access_token}`,
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
                  console.error(`Failed to create blob for ${file.path}`);
                  continue;
                }
                
                const newBlob = await createBlobResponse.json();
                blobMap.set(file.path, { sha: newBlob.sha, mode: file.mode });
              } catch (blobError) {
                console.error(`Error processing blob for ${file.path}:`, blobError);
                continue;
              }
            }
            
            console.log(`Successfully created ${blobMap.size} blobs`);
            
            // Build tree items from created blobs
            for (const [path, blob] of blobMap.entries()) {
              newTreeItems.push({
                path: path,
                mode: blob.mode,
                type: 'blob',
                sha: blob.sha,
              });
            }
            
            // Add deletions
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
          
          // Only include base_tree if repo is not empty
          if (baseTreeSha) {
            treePayload.base_tree = baseTreeSha;
          }
          
          const createTreeResponse = await fetch(
            `https://api.github.com/repos/${targetRepo.full_name}/git/trees`,
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

          // Step 4: Get the latest commit from target repo to use as parent (if not empty)
          let parentCommitSha = null;
          
          if (!isEmptyRepo) {
            const targetCommitResponse = await fetch(
              `https://api.github.com/repos/${targetRepo.full_name}/git/refs/heads/${targetRepo.default_branch}`,
              {
                headers: {
                  'Authorization': `Bearer ${account.access_token}`,
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

          // Step 5: Create commit with SHA for verification
          const commitMessage = `Synced from ${sourceRepo.full_name}\n\nOriginal commit: ${sourceCommit.commit.message}\nOriginal commit SHA: ${originalCommitSha}\nSynced files: +${filesToAdd.length} ~${filesToUpdate.length} -${filesToDelete.length}`;
          
          console.log(`Creating commit with message: ${commitMessage}`);
          const createCommitResponse = await fetch(
            `https://api.github.com/repos/${targetRepo.full_name}/git/commits`,
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

          console.log(`Successfully synced ${targetRepo.full_name}`);

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

          return {
            repo: targetRepo.full_name,
            success: true,
            filesAdded: filesToAdd.length,
            filesChanged: filesToUpdate.length,
            filesDeleted: filesToDelete.length,
          };
        } catch (error) {
          console.error(`Error syncing ${targetRepo.full_name}:`, error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

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

          return {
            repo: targetRepo.full_name,
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
