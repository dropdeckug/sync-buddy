CREATE TABLE public.linked_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dest_repo_id uuid NOT NULL REFERENCES public.repos(id) ON DELETE CASCADE,
  dest_path text NOT NULL,
  source_repo_full_name text NOT NULL,
  source_subpath text NOT NULL DEFAULT '',
  source_ref text NOT NULL DEFAULT 'main',
  last_synced_sha text,
  auto_sync boolean NOT NULL DEFAULT true,
  account_id uuid NOT NULL REFERENCES public.github_accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dest_repo_id, dest_path)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.linked_folders TO authenticated;
GRANT ALL ON public.linked_folders TO service_role;

ALTER TABLE public.linked_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own linked folders"
ON public.linked_folders FOR ALL
TO authenticated
USING (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()))
WITH CHECK (account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()));

CREATE TRIGGER linked_folders_updated_at
BEFORE UPDATE ON public.linked_folders
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();