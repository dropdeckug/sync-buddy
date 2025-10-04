-- Create repos table to store repository information
CREATE TABLE public.repos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.github_accounts(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  full_name text NOT NULL,
  github_id text NOT NULL,
  owner text NOT NULL,
  default_branch text DEFAULT 'main' NOT NULL,
  last_commit_sha text,
  last_commit_date timestamptz,
  is_private boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(account_id, github_id)
);

-- Create sync_groups table to manage mother/linked repo relationships
CREATE TABLE public.sync_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.github_accounts(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  mother_repo_id uuid REFERENCES public.repos(id) ON DELETE CASCADE NOT NULL,
  sync_mode text DEFAULT 'one-way' CHECK (sync_mode IN ('one-way', 'two-way')),
  last_sync_time timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create sync_group_repos junction table for linked repos
CREATE TABLE public.sync_group_repos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_group_id uuid REFERENCES public.sync_groups(id) ON DELETE CASCADE NOT NULL,
  repo_id uuid REFERENCES public.repos(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(sync_group_id, repo_id)
);

-- Enable RLS
ALTER TABLE public.repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_group_repos ENABLE ROW LEVEL SECURITY;

-- RLS Policies for repos
CREATE POLICY "Users can view their own repos"
  ON public.repos FOR SELECT
  USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert their own repos"
  ON public.repos FOR INSERT
  WITH CHECK (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their own repos"
  ON public.repos FOR UPDATE
  USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete their own repos"
  ON public.repos FOR DELETE
  USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));

-- RLS Policies for sync_groups
CREATE POLICY "Users can view their own sync groups"
  ON public.sync_groups FOR SELECT
  USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert their own sync groups"
  ON public.sync_groups FOR INSERT
  WITH CHECK (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their own sync groups"
  ON public.sync_groups FOR UPDATE
  USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete their own sync groups"
  ON public.sync_groups FOR DELETE
  USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));

-- RLS Policies for sync_group_repos
CREATE POLICY "Users can view their own sync group repos"
  ON public.sync_group_repos FOR SELECT
  USING (sync_group_id IN (
    SELECT id FROM public.sync_groups WHERE account_id IN (
      SELECT id FROM public.github_accounts WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Users can insert their own sync group repos"
  ON public.sync_group_repos FOR INSERT
  WITH CHECK (sync_group_id IN (
    SELECT id FROM public.sync_groups WHERE account_id IN (
      SELECT id FROM public.github_accounts WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Users can delete their own sync group repos"
  ON public.sync_group_repos FOR DELETE
  USING (sync_group_id IN (
    SELECT id FROM public.sync_groups WHERE account_id IN (
      SELECT id FROM public.github_accounts WHERE user_id = auth.uid()
    )
  ));

-- Add triggers for updated_at
CREATE TRIGGER set_repos_updated_at
  BEFORE UPDATE ON public.repos
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_sync_groups_updated_at
  BEFORE UPDATE ON public.sync_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();