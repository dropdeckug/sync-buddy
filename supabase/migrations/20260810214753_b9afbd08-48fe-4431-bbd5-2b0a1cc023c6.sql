CREATE TABLE public.push_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  device_label text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens TO authenticated;
GRANT ALL ON public.push_tokens TO service_role;

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own push tokens"
ON public.push_tokens FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER push_tokens_updated_at
BEFORE UPDATE ON public.push_tokens
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX push_tokens_user_id_idx ON public.push_tokens (user_id);