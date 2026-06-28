
-- =========================================================
-- updated_at helper
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- github_accounts
-- =========================================================
CREATE TABLE public.github_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  github_username text NOT NULL,
  github_user_id text NOT NULL,
  access_token text NOT NULL,
  avatar_url text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, github_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.github_accounts TO authenticated;
GRANT ALL ON public.github_accounts TO service_role;
ALTER TABLE public.github_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ga select own" ON public.github_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ga insert own" ON public.github_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ga update own" ON public.github_accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ga delete own" ON public.github_accounts FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.github_accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =========================================================
-- repos
-- =========================================================
CREATE TABLE public.repos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.github_accounts(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  full_name text NOT NULL,
  github_id text NOT NULL UNIQUE,
  owner text NOT NULL,
  default_branch text DEFAULT 'main' NOT NULL,
  last_commit_sha text,
  last_commit_date timestamptz,
  is_private boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(account_id, github_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repos TO authenticated;
GRANT ALL ON public.repos TO service_role;
ALTER TABLE public.repos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "repos select own" ON public.repos FOR SELECT
  USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "repos insert own" ON public.repos FOR INSERT
  WITH CHECK (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "repos update own" ON public.repos FOR UPDATE
  USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "repos delete own" ON public.repos FOR DELETE
  USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));
CREATE TRIGGER set_repos_updated_at BEFORE UPDATE ON public.repos
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =========================================================
-- sync_groups
-- =========================================================
CREATE TABLE public.sync_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.github_accounts(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  mother_repo_id uuid REFERENCES public.repos(id) ON DELETE CASCADE NOT NULL,
  sync_mode text DEFAULT 'one-way' CHECK (sync_mode IN ('one-way', 'two-way')),
  auto_sync_enabled boolean NOT NULL DEFAULT true,
  last_sync_time timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_groups TO authenticated;
GRANT ALL ON public.sync_groups TO service_role;
ALTER TABLE public.sync_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sg select own" ON public.sync_groups FOR SELECT
  USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "sg insert own" ON public.sync_groups FOR INSERT
  WITH CHECK (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "sg update own" ON public.sync_groups FOR UPDATE
  USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "sg delete own" ON public.sync_groups FOR DELETE
  USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));
CREATE TRIGGER set_sync_groups_updated_at BEFORE UPDATE ON public.sync_groups
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =========================================================
-- sync_group_repos
-- =========================================================
CREATE TABLE public.sync_group_repos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_group_id uuid REFERENCES public.sync_groups(id) ON DELETE CASCADE NOT NULL,
  repo_id uuid REFERENCES public.repos(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(sync_group_id, repo_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_group_repos TO authenticated;
GRANT ALL ON public.sync_group_repos TO service_role;
ALTER TABLE public.sync_group_repos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sgr select own" ON public.sync_group_repos FOR SELECT
  USING (sync_group_id IN (SELECT id FROM public.sync_groups WHERE account_id IN (
    SELECT id FROM public.github_accounts WHERE user_id = auth.uid())));
CREATE POLICY "sgr insert own" ON public.sync_group_repos FOR INSERT
  WITH CHECK (sync_group_id IN (SELECT id FROM public.sync_groups WHERE account_id IN (
    SELECT id FROM public.github_accounts WHERE user_id = auth.uid())));
CREATE POLICY "sgr delete own" ON public.sync_group_repos FOR DELETE
  USING (sync_group_id IN (SELECT id FROM public.sync_groups WHERE account_id IN (
    SELECT id FROM public.github_accounts WHERE user_id = auth.uid())));

-- =========================================================
-- sync_history
-- =========================================================
CREATE TABLE public.sync_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.github_accounts(id) ON DELETE CASCADE NOT NULL,
  repo_name text NOT NULL,
  repo_full_name text NOT NULL,
  commit_sha text,
  commit_message text,
  files_changed integer DEFAULT 0,
  files_added integer DEFAULT 0,
  files_deleted integer DEFAULT 0,
  status text NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
  error_message text,
  synced_at timestamptz DEFAULT now() NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_history TO authenticated;
GRANT ALL ON public.sync_history TO service_role;
ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sh select own" ON public.sync_history FOR SELECT
  USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "sh insert own" ON public.sync_history FOR INSERT
  WITH CHECK (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));

-- =========================================================
-- sync_progress
-- =========================================================
CREATE TABLE public.sync_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_group_id uuid NOT NULL,
  account_id uuid NOT NULL,
  source_repo_name text NOT NULL,
  source_repo_full_name text NOT NULL,
  target_repo_name text NOT NULL,
  target_repo_full_name text NOT NULL,
  status text NOT NULL,
  current_file text,
  files_processed integer DEFAULT 0,
  total_files integer DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_progress TO authenticated;
GRANT ALL ON public.sync_progress TO service_role;
ALTER TABLE public.sync_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp select own" ON public.sync_progress FOR SELECT
  USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "sp insert own" ON public.sync_progress FOR INSERT
  WITH CHECK (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "sp update own" ON public.sync_progress FOR UPDATE
  USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "sp delete own" ON public.sync_progress FOR DELETE
  USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));
CREATE TRIGGER set_sync_progress_updated_at BEFORE UPDATE ON public.sync_progress
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_progress;

-- =========================================================
-- drop_deployments
-- =========================================================
CREATE TABLE public.drop_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid NOT NULL,
  repo_name text NOT NULL,
  repo_full_name text,
  repo_url text,
  total_files integer NOT NULL DEFAULT 0,
  files_uploaded integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'creating',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drop_deployments TO authenticated;
GRANT ALL ON public.drop_deployments TO service_role;
ALTER TABLE public.drop_deployments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dd select own" ON public.drop_deployments FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "dd insert own" ON public.drop_deployments FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "dd update sys" ON public.drop_deployments FOR UPDATE USING (true);
CREATE POLICY "dd delete own" ON public.drop_deployments FOR DELETE USING (user_id = auth.uid());
ALTER PUBLICATION supabase_realtime ADD TABLE public.drop_deployments;

-- =========================================================
-- NEW: linked_folders
-- =========================================================
CREATE TABLE public.linked_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.github_accounts(id) ON DELETE CASCADE NOT NULL,
  dest_repo_id uuid REFERENCES public.repos(id) ON DELETE CASCADE NOT NULL,
  dest_path text NOT NULL,
  source_repo_full_name text NOT NULL,
  source_subpath text NOT NULL DEFAULT '',
  source_ref text NOT NULL DEFAULT 'main',
  last_synced_sha text,
  auto_sync boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dest_repo_id, dest_path)
);
CREATE INDEX linked_folders_source_idx ON public.linked_folders (source_repo_full_name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.linked_folders TO authenticated;
GRANT ALL ON public.linked_folders TO service_role;
ALTER TABLE public.linked_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lf select own" ON public.linked_folders FOR SELECT
  USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "lf insert own" ON public.linked_folders FOR INSERT
  WITH CHECK (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "lf update own" ON public.linked_folders FOR UPDATE
  USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "lf delete own" ON public.linked_folders FOR DELETE
  USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));
CREATE TRIGGER set_linked_folders_updated_at BEFORE UPDATE ON public.linked_folders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =========================================================
-- NEW: webhook_events (diagnostics)
-- =========================================================
CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_full_name text NOT NULL,
  event_type text,
  delivery_id text,
  signature_valid boolean,
  processed boolean DEFAULT false,
  error text,
  payload_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_events_repo_idx ON public.webhook_events (repo_full_name, created_at DESC);
GRANT SELECT ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "we select own" ON public.webhook_events FOR SELECT
  USING (repo_full_name IN (
    SELECT r.full_name FROM public.repos r
    JOIN public.github_accounts a ON a.id = r.account_id
    WHERE a.user_id = auth.uid()
  ));
ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_events;
