-- Create sync_progress table for real-time progress tracking
CREATE TABLE IF NOT EXISTS public.sync_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_group_id UUID NOT NULL,
  account_id UUID NOT NULL,
  source_repo_name TEXT NOT NULL,
  source_repo_full_name TEXT NOT NULL,
  target_repo_name TEXT NOT NULL,
  target_repo_full_name TEXT NOT NULL,
  status TEXT NOT NULL,
  current_file TEXT,
  files_processed INTEGER DEFAULT 0,
  total_files INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sync_progress ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own sync progress"
ON public.sync_progress
FOR SELECT
USING (account_id IN (
  SELECT id FROM github_accounts WHERE user_id = auth.uid()
));

CREATE POLICY "Users can insert their own sync progress"
ON public.sync_progress
FOR INSERT
WITH CHECK (account_id IN (
  SELECT id FROM github_accounts WHERE user_id = auth.uid()
));

CREATE POLICY "Users can update their own sync progress"
ON public.sync_progress
FOR UPDATE
USING (account_id IN (
  SELECT id FROM github_accounts WHERE user_id = auth.uid()
));

CREATE POLICY "Users can delete their own sync progress"
ON public.sync_progress
FOR DELETE
USING (account_id IN (
  SELECT id FROM github_accounts WHERE user_id = auth.uid()
));

-- Add trigger for updated_at
CREATE TRIGGER update_sync_progress_updated_at
  BEFORE UPDATE ON public.sync_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_progress;