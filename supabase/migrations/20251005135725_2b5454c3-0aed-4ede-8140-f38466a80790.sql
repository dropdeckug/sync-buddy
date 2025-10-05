-- Add unique constraint to github_id column in repos table
ALTER TABLE public.repos ADD CONSTRAINT repos_github_id_unique UNIQUE (github_id);