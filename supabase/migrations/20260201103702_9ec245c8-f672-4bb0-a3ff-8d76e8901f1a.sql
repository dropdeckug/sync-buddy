-- ============================================
-- TEAM WORKSPACES & ROLES
-- ============================================

-- Create role enum for workspace members
CREATE TYPE public.workspace_role AS ENUM ('owner', 'admin', 'syncer', 'viewer');

-- Workspaces table
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workspace members
CREATE TABLE public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role workspace_role NOT NULL DEFAULT 'viewer',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

-- Workspace invitations
CREATE TABLE public.workspace_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role workspace_role NOT NULL DEFAULT 'viewer',
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Link sync groups to workspaces (optional - for team access)
ALTER TABLE public.sync_groups ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL;

-- ============================================
-- AUDIT TRAIL
-- ============================================

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  resource_name TEXT,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_workspace ON public.audit_logs(workspace_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);

-- ============================================
-- NOTIFICATION SETTINGS
-- ============================================

CREATE TABLE public.notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('email', 'slack', 'discord', 'teams', 'webhook')),
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notification events configuration
CREATE TABLE public.notification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.notification_channels(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('sync_started', 'sync_completed', 'sync_failed', 'approval_required', 'approval_granted', 'approval_denied', 'member_joined', 'secret_detected')),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notification history
CREATE TABLE public.notification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.notification_channels(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- APPROVAL WORKFLOWS
-- ============================================

CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'rejected', 'expired');

CREATE TABLE public.sync_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_group_id UUID NOT NULL REFERENCES public.sync_groups(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  status approval_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id),
  review_comment TEXT,
  files_to_sync JSONB,
  source_repo TEXT NOT NULL,
  target_repos JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

-- Sync group settings for approval workflow
ALTER TABLE public.sync_groups ADD COLUMN requires_approval BOOLEAN DEFAULT false;
ALTER TABLE public.sync_groups ADD COLUMN approval_timeout_hours INTEGER DEFAULT 24;

-- ============================================
-- COMMENTS & ANNOTATIONS
-- ============================================

CREATE TABLE public.sync_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_group_id UUID REFERENCES public.sync_groups(id) ON DELETE CASCADE,
  sync_history_id UUID REFERENCES public.sync_history(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  mentioned_users UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_parent CHECK (sync_group_id IS NOT NULL OR sync_history_id IS NOT NULL)
);

-- ============================================
-- ACTIVITY FEED
-- ============================================

CREATE TABLE public.activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  activity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  resource_type TEXT,
  resource_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_feed_workspace ON public.activity_feed(workspace_id, created_at DESC);

-- ============================================
-- SECRET DETECTION
-- ============================================

CREATE TABLE public.detected_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_group_id UUID NOT NULL REFERENCES public.sync_groups(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  secret_type TEXT NOT NULL,
  line_number INTEGER,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  is_false_positive BOOLEAN DEFAULT false
);

-- ============================================
-- ROLLBACK CAPABILITIES
-- ============================================

CREATE TABLE public.sync_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_group_id UUID NOT NULL REFERENCES public.sync_groups(id) ON DELETE CASCADE,
  sync_history_id UUID REFERENCES public.sync_history(id),
  repo_full_name TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  files_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_snapshots_group ON public.sync_snapshots(sync_group_id, created_at DESC);

-- ============================================
-- PR-BASED SYNCING
-- ============================================

CREATE TABLE public.sync_pull_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_group_id UUID NOT NULL REFERENCES public.sync_groups(id) ON DELETE CASCADE,
  repo_full_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  pr_url TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'merged', 'closed')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  merged_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

-- Add PR mode to sync groups
ALTER TABLE public.sync_groups ADD COLUMN sync_via_pr BOOLEAN DEFAULT false;
ALTER TABLE public.sync_groups ADD COLUMN pr_branch_prefix TEXT DEFAULT 'sync/';

-- ============================================
-- GITHUB ACTIONS INTEGRATION
-- ============================================

CREATE TABLE public.ci_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_group_id UUID NOT NULL REFERENCES public.sync_groups(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('github_actions', 'jenkins', 'circleci', 'custom')),
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ci_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id UUID NOT NULL REFERENCES public.ci_triggers(id) ON DELETE CASCADE,
  sync_history_id UUID REFERENCES public.sync_history(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'success', 'failure')),
  run_url TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detected_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_pull_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ci_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ci_runs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- SECURITY DEFINER FUNCTIONS
-- ============================================

-- Check if user is workspace member with specific role
CREATE OR REPLACE FUNCTION public.has_workspace_role(_user_id UUID, _workspace_id UUID, _roles workspace_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id
      AND workspace_id = _workspace_id
      AND role = ANY(_roles)
  ) OR EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = _workspace_id
      AND owner_id = _user_id
  )
$$;

-- Check if user can access sync group (owner or workspace member)
CREATE OR REPLACE FUNCTION public.can_access_sync_group(_user_id UUID, _sync_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sync_groups sg
    LEFT JOIN public.github_accounts ga ON sg.account_id = ga.id
    WHERE sg.id = _sync_group_id
      AND (
        ga.user_id = _user_id
        OR (
          sg.workspace_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = sg.workspace_id
              AND wm.user_id = _user_id
          )
        )
      )
  )
$$;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Workspaces policies
CREATE POLICY "Users can view workspaces they own or are members of"
  ON public.workspaces FOR SELECT
  USING (owner_id = auth.uid() OR id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can create workspaces"
  ON public.workspaces FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update their workspaces"
  ON public.workspaces FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can delete their workspaces"
  ON public.workspaces FOR DELETE
  USING (owner_id = auth.uid());

-- Workspace members policies
CREATE POLICY "Members can view workspace members"
  ON public.workspace_members FOR SELECT
  USING (public.has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin', 'syncer', 'viewer']::workspace_role[]));

CREATE POLICY "Admins can manage workspace members"
  ON public.workspace_members FOR INSERT
  WITH CHECK (public.has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin']::workspace_role[]));

CREATE POLICY "Admins can update workspace members"
  ON public.workspace_members FOR UPDATE
  USING (public.has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin']::workspace_role[]));

CREATE POLICY "Admins can remove workspace members"
  ON public.workspace_members FOR DELETE
  USING (public.has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin']::workspace_role[]));

-- Invitations policies
CREATE POLICY "Admins can view invitations"
  ON public.workspace_invitations FOR SELECT
  USING (public.has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin']::workspace_role[]));

CREATE POLICY "Admins can create invitations"
  ON public.workspace_invitations FOR INSERT
  WITH CHECK (public.has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin']::workspace_role[]));

CREATE POLICY "Admins can delete invitations"
  ON public.workspace_invitations FOR DELETE
  USING (public.has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin']::workspace_role[]));

-- Audit logs policies
CREATE POLICY "Members can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (workspace_id IS NULL OR public.has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin', 'syncer', 'viewer']::workspace_role[]));

CREATE POLICY "System can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true);

-- Notification channels policies
CREATE POLICY "Users can view their notification channels"
  ON public.notification_channels FOR SELECT
  USING (user_id = auth.uid() OR (workspace_id IS NOT NULL AND public.has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin']::workspace_role[])));

CREATE POLICY "Users can create notification channels"
  ON public.notification_channels FOR INSERT
  WITH CHECK (user_id = auth.uid() OR (workspace_id IS NOT NULL AND public.has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin']::workspace_role[])));

CREATE POLICY "Users can update their notification channels"
  ON public.notification_channels FOR UPDATE
  USING (user_id = auth.uid() OR (workspace_id IS NOT NULL AND public.has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin']::workspace_role[])));

CREATE POLICY "Users can delete their notification channels"
  ON public.notification_channels FOR DELETE
  USING (user_id = auth.uid() OR (workspace_id IS NOT NULL AND public.has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin']::workspace_role[])));

-- Notification rules policies
CREATE POLICY "Users can manage notification rules"
  ON public.notification_rules FOR ALL
  USING (channel_id IN (SELECT id FROM public.notification_channels WHERE user_id = auth.uid()));

-- Notification history policies
CREATE POLICY "Users can view notification history"
  ON public.notification_history FOR SELECT
  USING (channel_id IN (SELECT id FROM public.notification_channels WHERE user_id = auth.uid()));

-- Sync approvals policies
CREATE POLICY "Users can view approvals for their sync groups"
  ON public.sync_approvals FOR SELECT
  USING (public.can_access_sync_group(auth.uid(), sync_group_id));

CREATE POLICY "Users can create approval requests"
  ON public.sync_approvals FOR INSERT
  WITH CHECK (public.can_access_sync_group(auth.uid(), sync_group_id));

CREATE POLICY "Admins can update approvals"
  ON public.sync_approvals FOR UPDATE
  USING (public.can_access_sync_group(auth.uid(), sync_group_id));

-- Sync comments policies
CREATE POLICY "Users can view comments"
  ON public.sync_comments FOR SELECT
  USING (
    (sync_group_id IS NOT NULL AND public.can_access_sync_group(auth.uid(), sync_group_id))
    OR sync_history_id IN (SELECT id FROM public.sync_history WHERE account_id IN (SELECT id FROM public.github_accounts WHERE user_id = auth.uid()))
  );

CREATE POLICY "Users can create comments"
  ON public.sync_comments FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their comments"
  ON public.sync_comments FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their comments"
  ON public.sync_comments FOR DELETE
  USING (user_id = auth.uid());

-- Activity feed policies
CREATE POLICY "Users can view activity feed"
  ON public.activity_feed FOR SELECT
  USING (workspace_id IS NULL OR public.has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin', 'syncer', 'viewer']::workspace_role[]));

CREATE POLICY "System can insert activity"
  ON public.activity_feed FOR INSERT
  WITH CHECK (true);

-- Detected secrets policies
CREATE POLICY "Users can view detected secrets"
  ON public.detected_secrets FOR SELECT
  USING (public.can_access_sync_group(auth.uid(), sync_group_id));

CREATE POLICY "System can insert detected secrets"
  ON public.detected_secrets FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update detected secrets"
  ON public.detected_secrets FOR UPDATE
  USING (public.can_access_sync_group(auth.uid(), sync_group_id));

-- Sync snapshots policies
CREATE POLICY "Users can view snapshots"
  ON public.sync_snapshots FOR SELECT
  USING (public.can_access_sync_group(auth.uid(), sync_group_id));

CREATE POLICY "System can create snapshots"
  ON public.sync_snapshots FOR INSERT
  WITH CHECK (true);

-- Sync pull requests policies
CREATE POLICY "Users can view PRs"
  ON public.sync_pull_requests FOR SELECT
  USING (public.can_access_sync_group(auth.uid(), sync_group_id));

CREATE POLICY "Users can create PRs"
  ON public.sync_pull_requests FOR INSERT
  WITH CHECK (public.can_access_sync_group(auth.uid(), sync_group_id));

CREATE POLICY "Users can update PRs"
  ON public.sync_pull_requests FOR UPDATE
  USING (public.can_access_sync_group(auth.uid(), sync_group_id));

-- CI triggers policies
CREATE POLICY "Users can view CI triggers"
  ON public.ci_triggers FOR SELECT
  USING (public.can_access_sync_group(auth.uid(), sync_group_id));

CREATE POLICY "Users can manage CI triggers"
  ON public.ci_triggers FOR ALL
  USING (public.can_access_sync_group(auth.uid(), sync_group_id));

-- CI runs policies
CREATE POLICY "Users can view CI runs"
  ON public.ci_runs FOR SELECT
  USING (trigger_id IN (SELECT id FROM public.ci_triggers WHERE public.can_access_sync_group(auth.uid(), sync_group_id)));

CREATE POLICY "System can manage CI runs"
  ON public.ci_runs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update CI runs"
  ON public.ci_runs FOR UPDATE
  USING (true);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE TRIGGER update_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_notification_channels_updated_at
  BEFORE UPDATE ON public.notification_channels
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_sync_comments_updated_at
  BEFORE UPDATE ON public.sync_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Enable realtime for activity feed
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_feed;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_approvals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_history;