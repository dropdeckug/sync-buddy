import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const gh = (accessToken: string) => ({
  'Authorization': `Bearer ${accessToken}`,
  'Accept': 'application/vnd.github.v3+json',
  'User-Agent': 'Supabase-Functions',
  'Content-Type': 'application/json',
});

interface SnapshotEntry {
  repo_id: string;
  repo_full_name: string;
  branch: string;
  role: 'source' | 'target';
  before_sha: string | null;
  after_sha: string | null;
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

    const body = await req.json();
    const action: string = body.action || 'rollback';
    const snapshotId: string = body.snapshotId;

    if (!snapshotId) throw new Error('snapshotId is required');

    // Authenticate the caller and make sure the snapshot belongs to them.
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) throw new Error('Missing authorization header');

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) throw new Error('Unauthorized');
    const userId = userData.user.id;

    const { data: snapshot, error: snapshotError } = await supabase
      .from('sync_snapshots')
      .select('*')
      .eq('id', snapshotId)
      .single();
    if (snapshotError) throw snapshotError;

    const { data: account, error: accountError } = await supabase
      .from('github_accounts')
      .select('id, user_id, access_token')
      .eq('id', snapshot.account_id)
      .single();
    if (accountError) throw accountError;
    if (account.user_id !== userId) throw new Error('Unauthorized');

    const accessToken = account.access_token as string;
    const entries = (snapshot.entries || []) as SnapshotEntry[];

    // ---------- Diff view ----------
    if (action === 'diff') {
      const repoFullName: string | undefined = body.repoFullName;
      const targets = repoFullName
        ? entries.filter((e) => e.repo_full_name === repoFullName)
        : entries.filter((e) => e.role === 'target');

      const diffs = [];
      for (const entry of targets) {
        if (!entry.before_sha || !entry.after_sha || entry.before_sha === entry.after_sha) {
          diffs.push({ repo_full_name: entry.repo_full_name, files: [], commits: [], note: 'No previous commit (repository was empty)' });
          continue;
        }
        const res = await fetch(
          `https://api.github.com/repos/${entry.repo_full_name}/compare/${entry.before_sha}...${entry.after_sha}`,
          { headers: gh(accessToken) }
        );
        if (!res.ok) {
          const text = await res.text();
          diffs.push({ repo_full_name: entry.repo_full_name, error: `${res.status}: ${text}`, files: [], commits: [] });
          continue;
        }
        const data = await res.json();
        diffs.push({
          repo_full_name: entry.repo_full_name,
          before_sha: entry.before_sha,
          after_sha: entry.after_sha,
          stats: { additions: data.files?.reduce((a: number, f: any) => a + (f.additions || 0), 0) || 0, deletions: data.files?.reduce((a: number, f: any) => a + (f.deletions || 0), 0) || 0 },
          commits: (data.commits || []).map((c: any) => ({
            sha: c.sha,
            message: c.commit?.message,
            author: c.commit?.author?.name,
            date: c.commit?.author?.date,
          })),
          files: (data.files || []).slice(0, 300).map((f: any) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            patch: typeof f.patch === 'string' ? f.patch.slice(0, 20000) : null,
          })),
        });
      }

      return new Response(JSON.stringify({ success: true, snapshot: { id: snapshot.id, summary: snapshot.summary, created_at: snapshot.created_at }, diffs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---------- Rollback ----------
    const results = [];
    for (const entry of entries) {
      // Nothing changed for this repo — skip.
      if (!entry.before_sha || entry.before_sha === entry.after_sha) {
        results.push({ repo: entry.repo_full_name, success: true, skipped: true, reason: entry.before_sha ? 'Unchanged by this sync' : 'Repository was empty before the sync' });
        continue;
      }

      try {
        const res = await fetch(
          `https://api.github.com/repos/${entry.repo_full_name}/git/refs/heads/${entry.branch}`,
          {
            method: 'PATCH',
            headers: gh(accessToken),
            body: JSON.stringify({ sha: entry.before_sha, force: true }),
          }
        );

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`${res.status}: ${text}`);
        }

        await supabase
          .from('repos')
          .update({ last_commit_sha: entry.before_sha })
          .eq('id', entry.repo_id);

        await supabase.from('sync_history').insert({
          account_id: snapshot.account_id,
          repo_name: entry.repo_full_name.split('/')[1] || entry.repo_full_name,
          repo_full_name: entry.repo_full_name,
          commit_sha: entry.before_sha,
          commit_message: `Rolled back to ${entry.before_sha.slice(0, 7)} (undo: ${snapshot.summary})`.slice(0, 500),
          status: 'completed',
        });

        results.push({ repo: entry.repo_full_name, success: true, restored_sha: entry.before_sha });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Rollback failed for ${entry.repo_full_name}:`, message);
        await supabase.from('sync_history').insert({
          account_id: snapshot.account_id,
          repo_name: entry.repo_full_name.split('/')[1] || entry.repo_full_name,
          repo_full_name: entry.repo_full_name,
          status: 'failed',
          error_message: `Rollback failed: ${message}`,
        });
        results.push({ repo: entry.repo_full_name, success: false, error: message });
      }
    }

    // Restore the mother repository that was in charge at snapshot time.
    if (snapshot.sync_group_id && snapshot.mother_repo_id) {
      await supabase
        .from('sync_groups')
        .update({ mother_repo_id: snapshot.mother_repo_id })
        .eq('id', snapshot.sync_group_id);
    }

    await supabase
      .from('sync_snapshots')
      .update({ rolled_back_at: new Date().toISOString() })
      .eq('id', snapshot.id);

    return new Response(JSON.stringify({ success: results.every((r) => r.success), results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('rollback-sync error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
