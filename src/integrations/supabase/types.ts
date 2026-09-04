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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          church_id: string | null
          created_at: string
          details: Json | null
          entity: string | null
          entity_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          church_id?: string | null
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          church_id?: string | null
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_statements: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          church_id: string
          created_at: string
          created_by: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          is_finalized: boolean
          period_month: number | null
          period_year: number | null
          rejection_reason: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          statement_date: string
          submitted_at: string | null
          submitted_by: string | null
          totals: Json
          updated_at: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          church_id: string
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          is_finalized?: boolean
          period_month?: number | null
          period_year?: number | null
          rejection_reason?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          statement_date: string
          submitted_at?: string | null
          submitted_by?: string | null
          totals?: Json
          updated_at?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          church_id?: string
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          is_finalized?: boolean
          period_month?: number | null
          period_year?: number | null
          rejection_reason?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          statement_date?: string
          submitted_at?: string | null
          submitted_by?: string | null
          totals?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_statements_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      church_members: {
        Row: {
          church_id: string
          created_at: string
          department: string | null
          department_id: string | null
          email: string | null
          family_name: string | null
          full_name: string
          id: string
          membership_number: string | null
          notes: string | null
          phone: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          department?: string | null
          department_id?: string | null
          email?: string | null
          family_name?: string | null
          full_name: string
          id?: string
          membership_number?: string | null
          notes?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          department?: string | null
          department_id?: string | null
          email?: string | null
          family_name?: string | null
          full_name?: string
          id?: string
          membership_number?: string | null
          notes?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "church_members_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_members_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      churches: {
        Row: {
          address: string | null
          auditor_name: string | null
          city: string | null
          code: string | null
          conference_id: string | null
          country: string | null
          created_at: string
          currency: string | null
          district_id: string | null
          elder_name: string | null
          email: string | null
          financial_year_start_month: number | null
          id: string
          logo_url: string | null
          name: string
          pastor_name: string | null
          phone: string | null
          treasurer_name: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          auditor_name?: string | null
          city?: string | null
          code?: string | null
          conference_id?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          district_id?: string | null
          elder_name?: string | null
          email?: string | null
          financial_year_start_month?: number | null
          id?: string
          logo_url?: string | null
          name: string
          pastor_name?: string | null
          phone?: string | null
          treasurer_name?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          auditor_name?: string | null
          city?: string | null
          code?: string | null
          conference_id?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          district_id?: string | null
          elder_name?: string | null
          email?: string | null
          financial_year_start_month?: number | null
          id?: string
          logo_url?: string | null
          name?: string
          pastor_name?: string | null
          phone?: string | null
          treasurer_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "churches_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "churches_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
        ]
      }
      conferences: {
        Row: {
          address: string | null
          code: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          church_id: string
          code: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          church_id: string
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          church_id?: string
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      districts: {
        Row: {
          code: string | null
          conference_id: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          conference_id?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          conference_id?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "districts_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          church_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          church_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          church_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          attachment_url: string | null
          category_id: string | null
          church_id: string
          created_at: string
          department_id: string | null
          description: string | null
          expense_number: string
          id: string
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          recorded_by: string | null
          reference_number: string | null
          rejection_reason: string | null
          remarks: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          submitted_at: string | null
          submitted_by: string | null
          transaction_date: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount: number
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          category_id?: string | null
          church_id: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          expense_number: string
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          recorded_by?: string | null
          reference_number?: string | null
          rejection_reason?: string | null
          remarks?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          transaction_date?: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          category_id?: string | null
          church_id?: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          expense_number?: string
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          recorded_by?: string | null
          reference_number?: string | null
          rejection_reason?: string | null
          remarks?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          transaction_date?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_years: {
        Row: {
          church_id: string
          created_at: string
          end_date: string
          id: string
          is_locked: boolean
          opening_bank: number
          opening_cash: number
          start_date: string
          year: number
        }
        Insert: {
          church_id: string
          created_at?: string
          end_date: string
          id?: string
          is_locked?: boolean
          opening_bank?: number
          opening_cash?: number
          start_date: string
          year: number
        }
        Update: {
          church_id?: string
          created_at?: string
          end_date?: string
          id?: string
          is_locked?: boolean
          opening_bank?: number
          opening_cash?: number
          start_date?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_years_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      notices: {
        Row: {
          category: string
          church_id: string
          created_at: string
          created_by: string | null
          ends_on: string | null
          id: string
          is_active: boolean
          message: string
          show_in_marquee: boolean
          sort_order: number
          starts_on: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          church_id: string
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          is_active?: boolean
          message: string
          show_in_marquee?: boolean
          sort_order?: number
          starts_on?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          church_id?: string
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          is_active?: boolean
          message?: string
          show_in_marquee?: boolean
          sort_order?: number
          starts_on?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notices_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      offering_categories: {
        Row: {
          church_id: string | null
          code: string | null
          conference_split_pct: number
          created_at: string
          fund_type: Database["public"]["Enums"]["fund_type"]
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          church_id?: string | null
          code?: string | null
          conference_split_pct?: number
          created_at?: string
          fund_type: Database["public"]["Enums"]["fund_type"]
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          church_id?: string | null
          code?: string | null
          conference_split_pct?: number
          created_at?: string
          fund_type?: Database["public"]["Enums"]["fund_type"]
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_categories_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          member_id: string | null
          phone: string | null
          primary_church_id: string | null
          rejection_reason: string | null
          updated_at: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          member_id?: string | null
          phone?: string | null
          primary_church_id?: string | null
          rejection_reason?: string | null
          updated_at?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          member_id?: string | null
          phone?: string | null
          primary_church_id?: string | null
          rejection_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "church_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_primary_church_id_fkey"
            columns: ["primary_church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          amount: number
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          church_id: string
          created_at: string
          department: string | null
          department_id: string | null
          description: string | null
          id: string
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          member_id: string | null
          member_name: string | null
          membership_number: string | null
          offering_category_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          phone: string | null
          receipt_number: string
          recorded_by: string | null
          reference_number: string | null
          rejection_reason: string | null
          remarks: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          submitted_at: string | null
          submitted_by: string | null
          transaction_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          church_id: string
          created_at?: string
          department?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          member_id?: string | null
          member_name?: string | null
          membership_number?: string | null
          offering_category_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          phone?: string | null
          receipt_number: string
          recorded_by?: string | null
          reference_number?: string | null
          rejection_reason?: string | null
          remarks?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          transaction_date?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          church_id?: string
          created_at?: string
          department?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          member_id?: string | null
          member_name?: string | null
          membership_number?: string | null
          offering_category_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          phone?: string | null
          receipt_number?: string
          recorded_by?: string | null
          reference_number?: string | null
          rejection_reason?: string | null
          remarks?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          transaction_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "church_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_offering_category_id_fkey"
            columns: ["offering_category_id"]
            isOneToOne: false
            referencedRelation: "offering_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      remittances: {
        Row: {
          bank_amount: number
          bank_name: string | null
          breakdown: Json
          cash_amount: number
          cheque_amount: number
          church_id: string
          created_at: string
          created_by: string | null
          id: string
          mpesa_amount: number
          reference_number: string | null
          remittance_date: string
          slip_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          bank_amount?: number
          bank_name?: string | null
          breakdown?: Json
          cash_amount?: number
          cheque_amount?: number
          church_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          mpesa_amount?: number
          reference_number?: string | null
          remittance_date?: string
          slip_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          bank_amount?: number
          bank_name?: string | null
          breakdown?: Json
          cash_amount?: number
          cheque_amount?: number
          church_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mpesa_amount?: number
          reference_number?: string | null
          remittance_date?: string
          slip_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "remittances_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          church_id: string
          contact_note: string | null
          created_at: string
          id: string
          marquee_enabled: boolean
          marquee_speed: number
          office_address: string | null
          office_hours: string | null
          support_email: string | null
          support_phone: string | null
          system_name: string
          tagline: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          church_id: string
          contact_note?: string | null
          created_at?: string
          id?: string
          marquee_enabled?: boolean
          marquee_speed?: number
          office_address?: string | null
          office_hours?: string | null
          support_email?: string | null
          support_phone?: string | null
          system_name?: string
          tagline?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          church_id?: string
          contact_note?: string | null
          created_at?: string
          id?: string
          marquee_enabled?: boolean
          marquee_speed?: number
          office_address?: string | null
          office_hours?: string | null
          support_email?: string | null
          support_phone?: string | null
          system_name?: string
          tagline?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_settings_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: true
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          church_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          church_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          church_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_reports: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          church_id: string
          created_at: string
          created_by: string | null
          data: Json
          finalized_at: string | null
          finalized_by: string | null
          id: string
          is_finalized: boolean
          period_month: number
          period_year: number
          rejection_reason: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          church_id: string
          created_at?: string
          created_by?: string | null
          data?: Json
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          is_finalized?: boolean
          period_month: number
          period_year: number
          rejection_reason?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          church_id?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          is_finalized?: boolean
          period_month?: number
          period_year?: number
          rejection_reason?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      user_can_read_church: {
        Args: { _church_id: string; _user_id: string }
        Returns: boolean
      }
      user_can_write_church: {
        Args: { _church_id: string; _user_id: string }
        Returns: boolean
      }
      user_church_ids: { Args: { _user_id: string }; Returns: string[] }
      user_in_church: {
        Args: { _church_id: string; _user_id: string }
        Returns: boolean
      }
      user_member_id: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "admin"
        | "treasurer"
        | "auditor"
        | "pastor"
        | "elder"
        | "member"
      fund_type: "trust" | "local" | "camp"
      payment_method:
        | "cash"
        | "mpesa"
        | "bank_transfer"
        | "cheque"
        | "bank_deposit"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "treasurer", "auditor", "pastor", "elder", "member"],
      fund_type: ["trust", "local", "camp"],
      payment_method: [
        "cash",
        "mpesa",
        "bank_transfer",
        "cheque",
        "bank_deposit",
      ],
    },
  },
} as const
