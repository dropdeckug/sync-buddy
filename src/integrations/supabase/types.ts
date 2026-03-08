export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_feed: {
        Row: {
          activity_type: string
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          resource_id: string | null
          resource_type: string | null
          title: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          title: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          title?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_feed_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          resource_id: string | null
          resource_name: string | null
          resource_type: string
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_name?: string | null
          resource_type: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_name?: string | null
          resource_type?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ci_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          run_url: string | null
          started_at: string | null
          status: string
          sync_history_id: string | null
          trigger_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          run_url?: string | null
          started_at?: string | null
          status: string
          sync_history_id?: string | null
          trigger_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          run_url?: string | null
          started_at?: string | null
          status?: string
          sync_history_id?: string | null
          trigger_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ci_runs_sync_history_id_fkey"
            columns: ["sync_history_id"]
            isOneToOne: false
            referencedRelation: "sync_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ci_runs_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "ci_triggers"
            referencedColumns: ["id"]
          },
        ]
      }
      ci_triggers: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_enabled: boolean
          name: string
          sync_group_id: string
          trigger_type: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          name: string
          sync_group_id: string
          trigger_type: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          name?: string
          sync_group_id?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ci_triggers_sync_group_id_fkey"
            columns: ["sync_group_id"]
            isOneToOne: false
            referencedRelation: "sync_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      detected_secrets: {
        Row: {
          detected_at: string
          file_path: string
          id: string
          is_false_positive: boolean | null
          line_number: number | null
          resolved_at: string | null
          resolved_by: string | null
          secret_type: string
          sync_group_id: string
        }
        Insert: {
          detected_at?: string
          file_path: string
          id?: string
          is_false_positive?: boolean | null
          line_number?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          secret_type: string
          sync_group_id: string
        }
        Update: {
          detected_at?: string
          file_path?: string
          id?: string
          is_false_positive?: boolean | null
          line_number?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          secret_type?: string
          sync_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "detected_secrets_sync_group_id_fkey"
            columns: ["sync_group_id"]
            isOneToOne: false
            referencedRelation: "sync_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      drop_deployments: {
        Row: {
          account_id: string
          created_at: string
          error_message: string | null
          files_uploaded: number
          id: string
          repo_full_name: string | null
          repo_name: string
          repo_url: string | null
          status: string
          total_files: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          error_message?: string | null
          files_uploaded?: number
          id?: string
          repo_full_name?: string | null
          repo_name: string
          repo_url?: string | null
          status?: string
          total_files?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          error_message?: string | null
          files_uploaded?: number
          id?: string
          repo_full_name?: string | null
          repo_name?: string
          repo_url?: string | null
          status?: string
          total_files?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      github_accounts: {
        Row: {
          access_token: string
          avatar_url: string | null
          created_at: string
          github_user_id: string
          github_username: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          avatar_url?: string | null
          created_at?: string
          github_user_id: string
          github_username: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          avatar_url?: string | null
          created_at?: string
          github_user_id?: string
          github_username?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_channels: {
        Row: {
          channel_type: string
          config: Json
          created_at: string
          id: string
          is_enabled: boolean
          name: string
          updated_at: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          channel_type: string
          config?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          name: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          channel_type?: string
          config?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          name?: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_channels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_history: {
        Row: {
          channel_id: string | null
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          sent_at: string | null
          status: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          payload: Json
          sent_at?: string | null
          status: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_history_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "notification_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_rules: {
        Row: {
          channel_id: string
          created_at: string
          event_type: string
          id: string
          is_enabled: boolean
        }
        Insert: {
          channel_id: string
          created_at?: string
          event_type: string
          id?: string
          is_enabled?: boolean
        }
        Update: {
          channel_id?: string
          created_at?: string
          event_type?: string
          id?: string
          is_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_rules_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "notification_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      repos: {
        Row: {
          account_id: string
          created_at: string
          default_branch: string
          full_name: string
          github_id: string
          id: string
          is_private: boolean | null
          last_commit_date: string | null
          last_commit_sha: string | null
          name: string
          owner: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          default_branch?: string
          full_name: string
          github_id: string
          id?: string
          is_private?: boolean | null
          last_commit_date?: string | null
          last_commit_sha?: string | null
          name: string
          owner: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          default_branch?: string
          full_name?: string
          github_id?: string
          id?: string
          is_private?: boolean | null
          last_commit_date?: string | null
          last_commit_sha?: string | null
          name?: string
          owner?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repos_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "github_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_approvals: {
        Row: {
          created_at: string
          expires_at: string
          files_to_sync: Json | null
          id: string
          requested_by: string
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_repo: string
          status: Database["public"]["Enums"]["approval_status"]
          sync_group_id: string
          target_repos: Json
        }
        Insert: {
          created_at?: string
          expires_at?: string
          files_to_sync?: Json | null
          id?: string
          requested_by: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_repo: string
          status?: Database["public"]["Enums"]["approval_status"]
          sync_group_id: string
          target_repos: Json
        }
        Update: {
          created_at?: string
          expires_at?: string
          files_to_sync?: Json | null
          id?: string
          requested_by?: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_repo?: string
          status?: Database["public"]["Enums"]["approval_status"]
          sync_group_id?: string
          target_repos?: Json
        }
        Relationships: [
          {
            foreignKeyName: "sync_approvals_sync_group_id_fkey"
            columns: ["sync_group_id"]
            isOneToOne: false
            referencedRelation: "sync_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          mentioned_users: string[] | null
          sync_group_id: string | null
          sync_history_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          mentioned_users?: string[] | null
          sync_group_id?: string | null
          sync_history_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          mentioned_users?: string[] | null
          sync_group_id?: string | null
          sync_history_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_comments_sync_group_id_fkey"
            columns: ["sync_group_id"]
            isOneToOne: false
            referencedRelation: "sync_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_comments_sync_history_id_fkey"
            columns: ["sync_history_id"]
            isOneToOne: false
            referencedRelation: "sync_history"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_group_repos: {
        Row: {
          created_at: string
          id: string
          repo_id: string
          sync_group_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          repo_id: string
          sync_group_id: string
        }
        Update: {
          created_at?: string
          id?: string
          repo_id?: string
          sync_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_group_repos_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "repos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_group_repos_sync_group_id_fkey"
            columns: ["sync_group_id"]
            isOneToOne: false
            referencedRelation: "sync_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_groups: {
        Row: {
          account_id: string
          approval_timeout_hours: number | null
          auto_sync_enabled: boolean | null
          created_at: string
          id: string
          last_sync_time: string | null
          mother_repo_id: string
          name: string
          pr_branch_prefix: string | null
          requires_approval: boolean | null
          sync_mode: string | null
          sync_via_pr: boolean | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          account_id: string
          approval_timeout_hours?: number | null
          auto_sync_enabled?: boolean | null
          created_at?: string
          id?: string
          last_sync_time?: string | null
          mother_repo_id: string
          name: string
          pr_branch_prefix?: string | null
          requires_approval?: boolean | null
          sync_mode?: string | null
          sync_via_pr?: boolean | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          account_id?: string
          approval_timeout_hours?: number | null
          auto_sync_enabled?: boolean | null
          created_at?: string
          id?: string
          last_sync_time?: string | null
          mother_repo_id?: string
          name?: string
          pr_branch_prefix?: string | null
          requires_approval?: boolean | null
          sync_mode?: string | null
          sync_via_pr?: boolean | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_groups_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "github_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_groups_mother_repo_id_fkey"
            columns: ["mother_repo_id"]
            isOneToOne: false
            referencedRelation: "repos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_groups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_history: {
        Row: {
          account_id: string
          commit_message: string | null
          commit_sha: string | null
          error_message: string | null
          files_added: number | null
          files_changed: number | null
          files_deleted: number | null
          id: string
          repo_full_name: string
          repo_name: string
          status: string
          synced_at: string
        }
        Insert: {
          account_id: string
          commit_message?: string | null
          commit_sha?: string | null
          error_message?: string | null
          files_added?: number | null
          files_changed?: number | null
          files_deleted?: number | null
          id?: string
          repo_full_name: string
          repo_name: string
          status: string
          synced_at?: string
        }
        Update: {
          account_id?: string
          commit_message?: string | null
          commit_sha?: string | null
          error_message?: string | null
          files_added?: number | null
          files_changed?: number | null
          files_deleted?: number | null
          id?: string
          repo_full_name?: string
          repo_name?: string
          status?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_history_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "github_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_progress: {
        Row: {
          account_id: string
          created_at: string
          current_file: string | null
          error_message: string | null
          files_processed: number | null
          id: string
          source_repo_full_name: string
          source_repo_name: string
          status: string
          sync_group_id: string
          target_repo_full_name: string
          target_repo_name: string
          total_files: number | null
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          current_file?: string | null
          error_message?: string | null
          files_processed?: number | null
          id?: string
          source_repo_full_name: string
          source_repo_name: string
          status: string
          sync_group_id: string
          target_repo_full_name: string
          target_repo_name: string
          total_files?: number | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          current_file?: string | null
          error_message?: string | null
          files_processed?: number | null
          id?: string
          source_repo_full_name?: string
          source_repo_name?: string
          status?: string
          sync_group_id?: string
          target_repo_full_name?: string
          target_repo_name?: string
          total_files?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      sync_pull_requests: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          merged_at: string | null
          pr_number: number
          pr_url: string
          repo_full_name: string
          status: string
          sync_group_id: string
          title: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          merged_at?: string | null
          pr_number: number
          pr_url: string
          repo_full_name: string
          status: string
          sync_group_id: string
          title: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          merged_at?: string | null
          pr_number?: number
          pr_url?: string
          repo_full_name?: string
          status?: string
          sync_group_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_pull_requests_sync_group_id_fkey"
            columns: ["sync_group_id"]
            isOneToOne: false
            referencedRelation: "sync_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_snapshots: {
        Row: {
          commit_sha: string
          created_at: string
          files_snapshot: Json | null
          id: string
          repo_full_name: string
          sync_group_id: string
          sync_history_id: string | null
        }
        Insert: {
          commit_sha: string
          created_at?: string
          files_snapshot?: Json | null
          id?: string
          repo_full_name: string
          sync_group_id: string
          sync_history_id?: string | null
        }
        Update: {
          commit_sha?: string
          created_at?: string
          files_snapshot?: Json | null
          id?: string
          repo_full_name?: string
          sync_group_id?: string
          sync_history_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_snapshots_sync_group_id_fkey"
            columns: ["sync_group_id"]
            isOneToOne: false
            referencedRelation: "sync_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_snapshots_sync_history_id_fkey"
            columns: ["sync_history_id"]
            isOneToOne: false
            referencedRelation: "sync_history"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["workspace_role"]
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["workspace_role"]
          token?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          id: string
          joined_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_sync_group: {
        Args: { _sync_group_id: string; _user_id: string }
        Returns: boolean
      }
      has_workspace_role: {
        Args: {
          _roles: Database["public"]["Enums"]["workspace_role"][]
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      approval_status: "pending" | "approved" | "rejected" | "expired"
      workspace_role: "owner" | "admin" | "syncer" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      approval_status: ["pending", "approved", "rejected", "expired"],
      workspace_role: ["owner", "admin", "syncer", "viewer"],
    },
  },
} as const
