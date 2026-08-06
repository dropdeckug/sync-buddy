CREATE TABLE public.sync_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.github_accounts(id) ON DELETE CASCADE,
  sync_group_id uuid REFERENCES public.sync_groups(id) ON DELETE CASCADE,
  source_repo_full_name text NOT NULL,
  source_commit_sha text,
  summary text NOT NULL DEFAULT 'Sync',
  entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  rolled_back_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_snapshots TO authenticated;
GRANT ALL ON public.sync_snapshots TO service_role;

ALTER TABLE public.sync_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own sync snapshots"
ON public.sync_snapshots FOR ALL TO authenticated
USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()))
WITH CHECK (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));

CREATE INDEX sync_snapshots_account_created_idx ON public.sync_snapshots (account_id, created_at DESC);

CREATE TRIGGER sync_snapshots_updated_at
BEFORE UPDATE ON public.sync_snapshots
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();