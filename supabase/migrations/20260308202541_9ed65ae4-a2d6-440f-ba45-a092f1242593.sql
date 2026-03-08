
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
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.drop_deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own deployments" ON public.drop_deployments FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert their own deployments" ON public.drop_deployments FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "System can update deployments" ON public.drop_deployments FOR UPDATE USING (true);
CREATE POLICY "Users can delete their own deployments" ON public.drop_deployments FOR DELETE USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.drop_deployments;
