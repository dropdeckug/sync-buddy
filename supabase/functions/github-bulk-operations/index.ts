import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BulkOperation {
  type: 'rename' | 'find-replace' | 'delete';
  repos: string[]; // Array of repo full names
  params: {
    // For rename
    oldPath?: string;
    newPath?: string;
    // For find-replace
    findPattern?: string;
    replaceWith?: string;
    filePattern?: string; // e.g., "*.ts", "*.js"
    // For delete
    paths?: string[];
  };
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const response = await fetch(url, options);
    if (response.status === 403 || response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '60';
      console.log(`Rate limited, waiting ${retryAfter}s before retry ${i + 1}/${retries}`);
      await new Promise(resolve => setTimeout(resolve, parseInt(retryAfter) * 1000));
      continue;
    }
    return response;
  }
  throw new Error('Max retries exceeded');
}

async function getFileContent(token: string, repoFullName: string, path: string) {
  const response = await fetchWithRetry(
    `https://api.github.com/repos/${repoFullName}/contents/${path}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Supabase-Functions',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get file: ${response.statusText}`);
  }

  const data = await response.json();
  const content = atob(data.content.replace(/\n/g, ''));
  return { content, sha: data.sha };
}

async function updateFile(token: string, repoFullName: string, path: string, content: string, sha: string, message: string) {
  const encodedContent = btoa(unescape(encodeURIComponent(content)));
  
  const response = await fetchWithRetry(
    `https://api.github.com/repos/${repoFullName}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Supabase-Functions',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, content: encodedContent, sha }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to update file: ${error.message}`);
  }

  return response.json();
}

async function deleteFile(token: string, repoFullName: string, path: string, sha: string, message: string) {
  const response = await fetchWithRetry(
    `https://api.github.com/repos/${repoFullName}/contents/${path}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Supabase-Functions',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, sha }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to delete file: ${error.message}`);
  }

  return response.json();
}

async function createFile(token: string, repoFullName: string, path: string, content: string, message: string) {
  const encodedContent = btoa(unescape(encodeURIComponent(content)));
  
  const response = await fetchWithRetry(
    `https://api.github.com/repos/${repoFullName}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Supabase-Functions',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, content: encodedContent }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to create file: ${error.message}`);
  }

  return response.json();
}

async function getRepoTree(token: string, repoFullName: string, branch: string = 'main') {
  const response = await fetchWithRetry(
    `https://api.github.com/repos/${repoFullName}/git/trees/${branch}?recursive=1`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Supabase-Functions',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get repo tree: ${response.statusText}`);
  }

  const data = await response.json();
  return data.tree.filter((item: any) => item.type === 'blob');
}

function matchPattern(filename: string, pattern: string): boolean {
  if (!pattern || pattern === '*') return true;
  const regex = new RegExp(
    '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
  );
  return regex.test(filename);
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

    const { accountId, operation } = await req.json() as { accountId: string; operation: BulkOperation };

    if (!accountId || !operation) {
      throw new Error('Missing required parameters');
    }

    // Get GitHub access token
    const { data: account, error: accountError } = await supabase
      .from('github_accounts')
      .select('access_token')
      .eq('id', accountId)
      .single();

    if (accountError) throw accountError;
    if (!account?.access_token) throw new Error('No access token found');

    const results: { repo: string; success: boolean; message: string; filesAffected?: number }[] = [];

    for (const repoFullName of operation.repos) {
      try {
        let filesAffected = 0;

        switch (operation.type) {
          case 'rename': {
            const { oldPath, newPath } = operation.params;
            if (!oldPath || !newPath) throw new Error('Missing oldPath or newPath');

            const { content, sha } = await getFileContent(account.access_token, repoFullName, oldPath);
            await createFile(account.access_token, repoFullName, newPath, content, `Rename ${oldPath} to ${newPath}`);
            await deleteFile(account.access_token, repoFullName, oldPath, sha, `Rename ${oldPath} to ${newPath}`);
            filesAffected = 1;
            break;
          }

          case 'find-replace': {
            const { findPattern, replaceWith, filePattern } = operation.params;
            if (!findPattern) throw new Error('Missing findPattern');

            const files = await getRepoTree(account.access_token, repoFullName);
            const matchingFiles = files.filter((f: any) => matchPattern(f.path.split('/').pop(), filePattern || '*'));

            for (const file of matchingFiles) {
              try {
                const { content, sha } = await getFileContent(account.access_token, repoFullName, file.path);
                if (content.includes(findPattern)) {
                  const newContent = content.split(findPattern).join(replaceWith || '');
                  await updateFile(
                    account.access_token,
                    repoFullName,
                    file.path,
                    newContent,
                    sha,
                    `Replace "${findPattern}" with "${replaceWith || ''}" in ${file.path}`
                  );
                  filesAffected++;
                }
              } catch (e) {
                console.error(`Error processing ${file.path}:`, e);
              }
              // Rate limiting delay
              await new Promise(resolve => setTimeout(resolve, 500));
            }
            break;
          }

          case 'delete': {
            const { paths } = operation.params;
            if (!paths || paths.length === 0) throw new Error('Missing paths to delete');

            for (const path of paths) {
              try {
                const { sha } = await getFileContent(account.access_token, repoFullName, path);
                await deleteFile(account.access_token, repoFullName, path, sha, `Delete ${path}`);
                filesAffected++;
              } catch (e) {
                console.error(`Error deleting ${path}:`, e);
              }
              await new Promise(resolve => setTimeout(resolve, 500));
            }
            break;
          }
        }

        results.push({
          repo: repoFullName,
          success: true,
          message: `Operation completed successfully`,
          filesAffected,
        });

        // Log to sync history
        await supabase.from('sync_history').insert({
          account_id: accountId,
          repo_name: repoFullName.split('/')[1],
          repo_full_name: repoFullName,
          status: 'success',
          commit_message: `Bulk ${operation.type} operation`,
          files_changed: filesAffected,
        });

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          repo: repoFullName,
          success: false,
          message,
        });

        await supabase.from('sync_history').insert({
          account_id: accountId,
          repo_name: repoFullName.split('/')[1],
          repo_full_name: repoFullName,
          status: 'error',
          error_message: message,
          commit_message: `Failed bulk ${operation.type} operation`,
        });
      }

      // Delay between repos to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in bulk operation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
