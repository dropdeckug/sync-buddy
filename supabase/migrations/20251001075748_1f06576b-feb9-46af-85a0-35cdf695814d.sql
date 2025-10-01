-- Fix function search path security issue with CASCADE
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate the trigger that was dropped
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.github_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();