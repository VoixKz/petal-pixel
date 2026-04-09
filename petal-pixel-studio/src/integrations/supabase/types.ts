export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    __InternalSupabase: {
        PostgrestVersion: "14.4"
    }
    public: {
        Tables: {
            flowers: {
                Row: {
                    algo_version: string
                    created_at: string
                    flower_id: string
                    params: Json
                    person_name: string
                    schema_version: string
                    seed: number
                }
                Insert: {
                    algo_version: string
                    created_at?: string
                    flower_id: string
                    params: Json
                    person_name: string
                    schema_version: string
                    seed: number
                }
                Update: {
                    algo_version?: string
                    created_at?: string
                    flower_id?: string
                    params?: Json
                    person_name?: string
                    schema_version?: string
                    seed?: number
                }
                Relationships: []
            }
            goose_db_version: {
                Row: {
                    id: number
                    is_applied: boolean
                    tstamp: string
                    version_id: number
                }
                Insert: {
                    id?: number
                    is_applied: boolean
                    tstamp?: string
                    version_id: number
                }
                Update: {
                    id?: number
                    is_applied?: boolean
                    tstamp?: string
                    version_id?: number
                }
                Relationships: []
            }
            mints: {
                Row: {
                    chain_id: number | null
                    contract_address: string | null
                    created_at: string
                    flower_id: string
                    status: string
                    token_uri: string | null
                    tx_hash: string | null
                    updated_at: string
                    wallet_address: string
                }
                Insert: {
                    chain_id?: number | null
                    contract_address?: string | null
                    created_at?: string
                    flower_id: string
                    status: string
                    token_uri?: string | null
                    tx_hash?: string | null
                    updated_at?: string
                    wallet_address: string
                }
                Update: {
                    chain_id?: number | null
                    contract_address?: string | null
                    created_at?: string
                    flower_id?: string
                    status?: string
                    token_uri?: string | null
                    tx_hash?: string | null
                    updated_at?: string
                    wallet_address?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "mints_flower_id_fkey"
                        columns: ["flower_id"]
                        isOneToOne: true
                        referencedRelation: "flowers"
                        referencedColumns: ["flower_id"]
                    },
                ]
            }
            profiles: {
                Row: {
                    avatar_url: string | null
                    created_at: string
                    display_name: string | null
                    email: string | null
                    id: string
                    updated_at: string
                    user_id: string
                }
                Insert: {
                    avatar_url?: string | null
                    created_at?: string
                    display_name?: string | null
                    email?: string | null
                    id?: string
                    updated_at?: string
                    user_id: string
                }
                Update: {
                    avatar_url?: string | null
                    created_at?: string
                    display_name?: string | null
                    email?: string | null
                    id?: string
                    updated_at?: string
                    user_id?: string
                }
                Relationships: []
            }
            user_flowers: {
                Row: {
                    created_at: string
                    flower_id: string
                    generation_word: string | null
                    id: string
                    is_minted: boolean
                    params: Json | null
                    saved_name: string | null
                    token_uri: string | null
                    tx_hash: string | null
                    updated_at: string
                    user_id: string
                }
                Insert: {
                    created_at?: string
                    flower_id: string
                    generation_word?: string | null
                    id?: string
                    is_minted?: boolean
                    params?: Json | null
                    saved_name?: string | null
                    token_uri?: string | null
                    tx_hash?: string | null
                    updated_at?: string
                    user_id: string
                }
                Update: {
                    created_at?: string
                    flower_id?: string
                    generation_word?: string | null
                    id?: string
                    is_minted?: boolean
                    params?: Json | null
                    saved_name?: string | null
                    token_uri?: string | null
                    tx_hash?: string | null
                    updated_at?: string
                    user_id?: string
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
