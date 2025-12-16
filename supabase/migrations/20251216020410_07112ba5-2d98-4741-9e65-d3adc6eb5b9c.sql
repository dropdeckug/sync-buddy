-- Add auto_sync_enabled column to sync_groups table
ALTER TABLE public.sync_groups ADD COLUMN auto_sync_enabled boolean DEFAULT true;