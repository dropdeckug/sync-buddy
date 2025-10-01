-- Create github_accounts table to store OAuth tokens
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

-- Create sync_history table to track all sync operations
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

-- Enable RLS
ALTER TABLE public.github_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for github_accounts
CREATE POLICY "Users can view their own GitHub accounts"
  ON public.github_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own GitHub accounts"
  ON public.github_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own GitHub accounts"
  ON public.github_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own GitHub accounts"
  ON public.github_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for sync_history
CREATE POLICY "Users can view their own sync history"
  ON public.sync_history FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM public.github_accounts WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own sync history"
  ON public.sync_history FOR INSERT
  WITH CHECK (
    account_id IN (
      SELECT id FROM public.github_accounts WHERE user_id = auth.uid()
    )
  );

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for github_accounts
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.github_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();