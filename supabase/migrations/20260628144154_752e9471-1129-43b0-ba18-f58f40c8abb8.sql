
REVOKE EXECUTE ON FUNCTION public.handle_updated_at() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "dd update sys" ON public.drop_deployments;
CREATE POLICY "dd update own" ON public.drop_deployments FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
