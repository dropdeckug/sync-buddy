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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
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
          auto_sync_enabled: boolean | null
          created_at: string
          id: string
          last_sync_time: string | null
          mother_repo_id: string
          name: string
          sync_mode: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          auto_sync_enabled?: boolean | null
          created_at?: string
          id?: string
          last_sync_time?: string | null
          mother_repo_id: string
          name: string
          sync_mode?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          auto_sync_enabled?: boolean | null
          created_at?: string
          id?: string
          last_sync_time?: string | null
          mother_repo_id?: string
          name?: string
          sync_mode?: string | null
          updated_at?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
