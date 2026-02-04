# Supabase Migration Guide

This guide provides everything you need to transfer this project to a standalone Supabase instance.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Database Schema (SQL)](#database-schema-sql)
3. [Database Functions](#database-functions)
4. [Row Level Security (RLS) Policies](#row-level-security-policies)
5. [Edge Functions](#edge-functions)
6. [Secrets Configuration](#secrets-configuration)
7. [Deployment Steps](#deployment-steps)

---

## Prerequisites

- Supabase CLI installed: `npm install -g supabase`
- A new Supabase project created at [supabase.com](https://supabase.com)
- GitHub OAuth App for authentication

---

## Database Schema (SQL)

Run this SQL in your Supabase SQL Editor to create all tables:

```sql
-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'rejected', 'expired');
CREATE TYPE public.workspace_role AS ENUM ('owner', 'admin', 'syncer', 'viewer');

-- ============================================
-- TABLES
-- ============================================

-- GitHub Accounts
CREATE TABLE public.github_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  github_username TEXT NOT NULL,
  github_user_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Repositories
CREATE TABLE public.repos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.github_accounts(id),
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  github_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',
  last_commit_sha TEXT,
  last_commit_date TIMESTAMP WITH TIME ZONE,
  is_private BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Workspaces
CREATE TABLE public.workspaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Workspace Members
CREATE TABLE public.workspace_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id),
  user_id UUID NOT NULL,
  role workspace_role NOT NULL DEFAULT 'viewer',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Workspace Invitations
CREATE TABLE public.workspace_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id),
  email TEXT NOT NULL,
  role workspace_role NOT NULL DEFAULT 'viewer',
  token TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  invited_by UUID NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Sync Groups
CREATE TABLE public.sync_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.github_accounts(id),
  mother_repo_id UUID NOT NULL REFERENCES public.repos(id),
  workspace_id UUID REFERENCES public.workspaces(id),
  name TEXT NOT NULL,
  sync_mode TEXT DEFAULT 'one-way',
  auto_sync_enabled BOOLEAN DEFAULT true,
  requires_approval BOOLEAN DEFAULT false,
  approval_timeout_hours INTEGER DEFAULT 24,
  sync_via_pr BOOLEAN DEFAULT false,
  pr_branch_prefix TEXT DEFAULT 'sync/',
  last_sync_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Sync Group Repos (Child Repositories)
CREATE TABLE public.sync_group_repos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_group_id UUID NOT NULL REFERENCES public.sync_groups(id),
  repo_id UUID NOT NULL REFERENCES public.repos(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Sync History
CREATE TABLE public.sync_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.github_accounts(id),
  repo_name TEXT NOT NULL,
  repo_full_name TEXT NOT NULL,
  commit_sha TEXT,
  commit_message TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  files_changed INTEGER DEFAULT 0,
  files_added INTEGER DEFAULT 0,
  files_deleted INTEGER DEFAULT 0,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Sync Progress (Real-time tracking)
CREATE TABLE public.sync_progress (
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

-- Sync Snapshots (For Rollback)
CREATE TABLE public.sync_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_group_id UUID NOT NULL REFERENCES public.sync_groups(id),
  sync_history_id UUID REFERENCES public.sync_history(id),
  repo_full_name TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  files_snapshot JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Sync Approvals
CREATE TABLE public.sync_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_group_id UUID NOT NULL REFERENCES public.sync_groups(id),
  source_repo TEXT NOT NULL,
  target_repos JSONB NOT NULL,
  files_to_sync JSONB,
  requested_by UUID NOT NULL,
  status approval_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_comment TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Sync Pull Requests
CREATE TABLE public.sync_pull_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_group_id UUID NOT NULL REFERENCES public.sync_groups(id),
  repo_full_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  pr_url TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by UUID,
  merged_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Sync Comments
CREATE TABLE public.sync_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_group_id UUID REFERENCES public.sync_groups(id),
  sync_history_id UUID REFERENCES public.sync_history(id),
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  mentioned_users TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Detected Secrets
CREATE TABLE public.detected_secrets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_group_id UUID NOT NULL REFERENCES public.sync_groups(id),
  file_path TEXT NOT NULL,
  secret_type TEXT NOT NULL,
  line_number INTEGER,
  is_false_positive BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- CI Triggers
CREATE TABLE public.ci_triggers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_group_id UUID NOT NULL REFERENCES public.sync_groups(id),
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- CI Runs
CREATE TABLE public.ci_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trigger_id UUID NOT NULL REFERENCES public.ci_triggers(id),
  sync_history_id UUID REFERENCES public.sync_history(id),
  status TEXT NOT NULL,
  run_url TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Notification Channels
CREATE TABLE public.notification_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id),
  user_id UUID,
  name TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Notification Rules
CREATE TABLE public.notification_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.notification_channels(id),
  event_type TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Notification History
CREATE TABLE public.notification_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID REFERENCES public.notification_channels(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Activity Feed
CREATE TABLE public.activity_feed (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id),
  user_id UUID,
  activity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  resource_type TEXT,
  resource_id UUID,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Audit Logs
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id),
  user_id UUID,
  user_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  resource_name TEXT,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.github_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_group_repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_pull_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detected_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ci_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ci_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- REALTIME
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_progress;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_feed;
```

---

## Database Functions

```sql
-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Updated At Trigger Function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Check Workspace Role
CREATE OR REPLACE FUNCTION public.has_workspace_role(_user_id uuid, _workspace_id uuid, _roles workspace_role[])
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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

-- Check Sync Group Access
CREATE OR REPLACE FUNCTION public.can_access_sync_group(_user_id uuid, _sync_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
-- TRIGGERS
-- ============================================

CREATE TRIGGER update_github_accounts_updated_at
  BEFORE UPDATE ON public.github_accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_repos_updated_at
  BEFORE UPDATE ON public.repos
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_sync_groups_updated_at
  BEFORE UPDATE ON public.sync_groups
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_sync_progress_updated_at
  BEFORE UPDATE ON public.sync_progress
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_notification_channels_updated_at
  BEFORE UPDATE ON public.notification_channels
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_sync_comments_updated_at
  BEFORE UPDATE ON public.sync_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
```

---

## Row Level Security Policies

```sql
-- ============================================
-- RLS POLICIES
-- ============================================

-- GitHub Accounts
CREATE POLICY "Users can view their own GitHub accounts" ON public.github_accounts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own GitHub accounts" ON public.github_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own GitHub accounts" ON public.github_accounts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own GitHub accounts" ON public.github_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Repos
CREATE POLICY "Users can view their own repos" ON public.repos
  FOR SELECT USING (account_id IN (SELECT id FROM github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert their own repos" ON public.repos
  FOR INSERT WITH CHECK (account_id IN (SELECT id FROM github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "Users can update their own repos" ON public.repos
  FOR UPDATE USING (account_id IN (SELECT id FROM github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete their own repos" ON public.repos
  FOR DELETE USING (account_id IN (SELECT id FROM github_accounts WHERE user_id = auth.uid()));

-- Workspaces
CREATE POLICY "Users can create workspaces" ON public.workspaces
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Users can view workspaces they own or are members of" ON public.workspaces
  FOR SELECT USING (owner_id = auth.uid() OR id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "Owners can update their workspaces" ON public.workspaces
  FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "Owners can delete their workspaces" ON public.workspaces
  FOR DELETE USING (owner_id = auth.uid());

-- Workspace Members
CREATE POLICY "Members can view workspace members" ON public.workspace_members
  FOR SELECT USING (has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin', 'syncer', 'viewer']::workspace_role[]));
CREATE POLICY "Admins can manage workspace members" ON public.workspace_members
  FOR INSERT WITH CHECK (has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin']::workspace_role[]));
CREATE POLICY "Admins can update workspace members" ON public.workspace_members
  FOR UPDATE USING (has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin']::workspace_role[]));
CREATE POLICY "Admins can remove workspace members" ON public.workspace_members
  FOR DELETE USING (has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin']::workspace_role[]));

-- Sync Groups
CREATE POLICY "Users can view their own sync groups" ON public.sync_groups
  FOR SELECT USING (account_id IN (SELECT id FROM github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert their own sync groups" ON public.sync_groups
  FOR INSERT WITH CHECK (account_id IN (SELECT id FROM github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "Users can update their own sync groups" ON public.sync_groups
  FOR UPDATE USING (account_id IN (SELECT id FROM github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete their own sync groups" ON public.sync_groups
  FOR DELETE USING (account_id IN (SELECT id FROM github_accounts WHERE user_id = auth.uid()));

-- Sync Group Repos
CREATE POLICY "Users can view their own sync group repos" ON public.sync_group_repos
  FOR SELECT USING (sync_group_id IN (SELECT id FROM sync_groups WHERE account_id IN (SELECT id FROM github_accounts WHERE user_id = auth.uid())));
CREATE POLICY "Users can insert their own sync group repos" ON public.sync_group_repos
  FOR INSERT WITH CHECK (sync_group_id IN (SELECT id FROM sync_groups WHERE account_id IN (SELECT id FROM github_accounts WHERE user_id = auth.uid())));
CREATE POLICY "Users can delete their own sync group repos" ON public.sync_group_repos
  FOR DELETE USING (sync_group_id IN (SELECT id FROM sync_groups WHERE account_id IN (SELECT id FROM github_accounts WHERE user_id = auth.uid())));

-- Sync History
CREATE POLICY "Users can view their own sync history" ON public.sync_history
  FOR SELECT USING (account_id IN (SELECT id FROM github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert their own sync history" ON public.sync_history
  FOR INSERT WITH CHECK (account_id IN (SELECT id FROM github_accounts WHERE user_id = auth.uid()));

-- Sync Progress
CREATE POLICY "Users can view their own sync progress" ON public.sync_progress
  FOR SELECT USING (account_id IN (SELECT id FROM github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert their own sync progress" ON public.sync_progress
  FOR INSERT WITH CHECK (account_id IN (SELECT id FROM github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "Users can update their own sync progress" ON public.sync_progress
  FOR UPDATE USING (account_id IN (SELECT id FROM github_accounts WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete their own sync progress" ON public.sync_progress
  FOR DELETE USING (account_id IN (SELECT id FROM github_accounts WHERE user_id = auth.uid()));

-- Sync Snapshots
CREATE POLICY "Users can view snapshots" ON public.sync_snapshots
  FOR SELECT USING (can_access_sync_group(auth.uid(), sync_group_id));
CREATE POLICY "System can create snapshots" ON public.sync_snapshots
  FOR INSERT WITH CHECK (true);

-- Sync Approvals
CREATE POLICY "Users can view approvals for their sync groups" ON public.sync_approvals
  FOR SELECT USING (can_access_sync_group(auth.uid(), sync_group_id));
CREATE POLICY "Users can create approval requests" ON public.sync_approvals
  FOR INSERT WITH CHECK (can_access_sync_group(auth.uid(), sync_group_id));
CREATE POLICY "Admins can update approvals" ON public.sync_approvals
  FOR UPDATE USING (can_access_sync_group(auth.uid(), sync_group_id));

-- Sync Pull Requests
CREATE POLICY "Users can view PRs" ON public.sync_pull_requests
  FOR SELECT USING (can_access_sync_group(auth.uid(), sync_group_id));
CREATE POLICY "Users can create PRs" ON public.sync_pull_requests
  FOR INSERT WITH CHECK (can_access_sync_group(auth.uid(), sync_group_id));
CREATE POLICY "Users can update PRs" ON public.sync_pull_requests
  FOR UPDATE USING (can_access_sync_group(auth.uid(), sync_group_id));

-- Sync Comments
CREATE POLICY "Users can view comments" ON public.sync_comments
  FOR SELECT USING ((sync_group_id IS NOT NULL AND can_access_sync_group(auth.uid(), sync_group_id)) OR (sync_history_id IN (SELECT id FROM sync_history WHERE account_id IN (SELECT id FROM github_accounts WHERE user_id = auth.uid()))));
CREATE POLICY "Users can create comments" ON public.sync_comments
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their comments" ON public.sync_comments
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete their comments" ON public.sync_comments
  FOR DELETE USING (user_id = auth.uid());

-- Detected Secrets
CREATE POLICY "Users can view detected secrets" ON public.detected_secrets
  FOR SELECT USING (can_access_sync_group(auth.uid(), sync_group_id));
CREATE POLICY "System can insert detected secrets" ON public.detected_secrets
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update detected secrets" ON public.detected_secrets
  FOR UPDATE USING (can_access_sync_group(auth.uid(), sync_group_id));

-- CI Triggers
CREATE POLICY "Users can view CI triggers" ON public.ci_triggers
  FOR SELECT USING (can_access_sync_group(auth.uid(), sync_group_id));
CREATE POLICY "Users can manage CI triggers" ON public.ci_triggers
  FOR ALL USING (can_access_sync_group(auth.uid(), sync_group_id));

-- CI Runs
CREATE POLICY "Users can view CI runs" ON public.ci_runs
  FOR SELECT USING (trigger_id IN (SELECT id FROM ci_triggers WHERE can_access_sync_group(auth.uid(), sync_group_id)));
CREATE POLICY "System can manage CI runs" ON public.ci_runs
  FOR INSERT WITH CHECK (true);
CREATE POLICY "System can update CI runs" ON public.ci_runs
  FOR UPDATE USING (true);

-- Notification Channels
CREATE POLICY "Users can view their notification channels" ON public.notification_channels
  FOR SELECT USING (user_id = auth.uid() OR (workspace_id IS NOT NULL AND has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin']::workspace_role[])));
CREATE POLICY "Users can create notification channels" ON public.notification_channels
  FOR INSERT WITH CHECK (user_id = auth.uid() OR (workspace_id IS NOT NULL AND has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin']::workspace_role[])));
CREATE POLICY "Users can update their notification channels" ON public.notification_channels
  FOR UPDATE USING (user_id = auth.uid() OR (workspace_id IS NOT NULL AND has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin']::workspace_role[])));
CREATE POLICY "Users can delete their notification channels" ON public.notification_channels
  FOR DELETE USING (user_id = auth.uid() OR (workspace_id IS NOT NULL AND has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin']::workspace_role[])));

-- Notification Rules
CREATE POLICY "Users can manage notification rules" ON public.notification_rules
  FOR ALL USING (channel_id IN (SELECT id FROM notification_channels WHERE user_id = auth.uid()));

-- Notification History
CREATE POLICY "Users can view notification history" ON public.notification_history
  FOR SELECT USING (channel_id IN (SELECT id FROM notification_channels WHERE user_id = auth.uid()));

-- Activity Feed
CREATE POLICY "Users can view activity feed" ON public.activity_feed
  FOR SELECT USING (workspace_id IS NULL OR has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin', 'syncer', 'viewer']::workspace_role[]));
CREATE POLICY "System can insert activity" ON public.activity_feed
  FOR INSERT WITH CHECK (true);

-- Audit Logs
CREATE POLICY "Members can view audit logs" ON public.audit_logs
  FOR SELECT USING (workspace_id IS NULL OR has_workspace_role(auth.uid(), workspace_id, ARRAY['owner', 'admin', 'syncer', 'viewer']::workspace_role[]));
CREATE POLICY "System can insert audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (true);
```

---

## Edge Functions

The following edge functions need to be deployed. Each function is in the `supabase/functions/` directory.

| Function | Description | JWT Required |
|----------|-------------|--------------|
| `github-oauth` | Handles GitHub OAuth flow | Yes |
| `github-repos` | Lists repositories from GitHub | Yes |
| `github-browse` | Browses repository file tree | Yes |
| `github-get-file` | Gets file content from repo | Yes |
| `github-save-file` | Saves/commits file to repo | Yes |
| `github-bulk-operations` | Performs bulk file operations | Yes |
| `sync-repos` | Main sync logic | Yes |
| `register-webhook` | Registers GitHub webhooks | Yes |
| `github-webhook` | Receives webhook events | **No** |
| `get-commits` | Fetches commit history | Yes |
| `create-sync-pr` | Creates PRs for syncs | Yes |
| `rollback-sync` | Rollback to previous state | Yes |
| `scan-secrets` | Scans for leaked secrets | Yes |
| `send-notification` | Sends notifications | Yes |
| `trigger-ci` | Triggers CI/CD pipelines | Yes |

### Deploying Edge Functions

```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy all functions
supabase functions deploy github-oauth
supabase functions deploy github-repos
supabase functions deploy github-browse
supabase functions deploy github-get-file
supabase functions deploy github-save-file
supabase functions deploy github-bulk-operations
supabase functions deploy sync-repos
supabase functions deploy register-webhook
supabase functions deploy github-webhook --no-verify-jwt
supabase functions deploy get-commits
supabase functions deploy create-sync-pr
supabase functions deploy rollback-sync
supabase functions deploy scan-secrets
supabase functions deploy send-notification
supabase functions deploy trigger-ci
```

---

## Secrets Configuration

Set these secrets in your Supabase project:

```bash
# GitHub OAuth (Create at https://github.com/settings/developers)
supabase secrets set GITHUB_CLIENT_ID=your_github_client_id
supabase secrets set GITHUB_CLIENT_SECRET=your_github_client_secret

# GitHub Webhook Secret (Random string for webhook verification)
supabase secrets set GITHUB_WEBHOOK_SECRET=your_random_webhook_secret

# These are auto-provided by Supabase
# SUPABASE_URL
# SUPABASE_ANON_KEY
# SUPABASE_SERVICE_ROLE_KEY
```

### Environment Variables for Frontend

Create a `.env` file:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
VITE_SUPABASE_PROJECT_ID=YOUR_PROJECT_REF
```

---

## Deployment Steps

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and anon key

### 2. Run Database Migrations

1. Open SQL Editor in Supabase Dashboard
2. Run all SQL from sections above in order:
   - Schema
   - Functions
   - RLS Policies

### 3. Setup GitHub OAuth

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App:
   - **Application name**: Your app name
   - **Homepage URL**: Your app URL
   - **Authorization callback URL**: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/github-oauth`
3. Copy Client ID and Client Secret
4. Set as Supabase secrets

### 4. Deploy Edge Functions

```bash
cd your-project
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy --all
```

### 5. Configure Frontend

Update your `.env` with Supabase credentials.

### 6. Deploy Frontend

Build and deploy your frontend to your preferred hosting:

```bash
npm run build
# Deploy dist folder to Vercel, Netlify, etc.
```

---

## Post-Migration Checklist

- [ ] All tables created
- [ ] All RLS policies applied
- [ ] All functions deployed
- [ ] Secrets configured
- [ ] GitHub OAuth working
- [ ] Webhooks registering
- [ ] Syncing working
- [ ] Real-time updates working

---

## Troubleshooting

### "Permission denied" errors
- Check RLS policies are created
- Verify user is authenticated

### Webhook not receiving events
- Verify `github-webhook` deployed with `--no-verify-jwt`
- Check webhook secret matches

### Sync timing out
- Large repos may need longer timeout
- Check edge function logs in Supabase Dashboard

---

For more help, refer to [Supabase Documentation](https://supabase.com/docs).
