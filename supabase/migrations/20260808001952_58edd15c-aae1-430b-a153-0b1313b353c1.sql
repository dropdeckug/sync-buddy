CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_full_name text NOT NULL,
  event_type text,
  delivery_id text,
  signature_valid boolean NOT NULL DEFAULT false,
  processed boolean NOT NULL DEFAULT false,
  error text,
  payload_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view webhook events for their repositories"
ON public.webhook_events
FOR SELECT
TO authenticated
USING (
  repo_full_name IN (
    SELECT r.full_name
    FROM public.repos r
    JOIN public.github_accounts a ON a.id = r.account_id
    WHERE a.user_id = auth.uid()
  )
);
CREATE INDEX webhook_events_repo_created_idx
ON public.webhook_events (repo_full_name, created_at DESC);