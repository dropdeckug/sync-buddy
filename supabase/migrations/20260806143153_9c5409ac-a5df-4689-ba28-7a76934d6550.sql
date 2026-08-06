ALTER TABLE public.sync_snapshots
ADD COLUMN mother_repo_id uuid REFERENCES public.repos(id) ON DELETE SET NULL;