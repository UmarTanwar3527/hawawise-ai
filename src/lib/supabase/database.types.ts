
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "ai_conversations": {
                  Row: {
                    "created_at": string,"id": string,"title": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"title"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"title"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ai_evidence": {
                  Row: {
                    "accessed_at": string,"excerpt": string | null,"forecast_id": string | null,"id": string,"message_id": string,"reading_id": string | null,"source_name": string,"source_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accessed_at"?: string,"excerpt"?: string | null,"forecast_id"?: string | null,"id"?: string,"message_id": string,"reading_id"?: string | null,"source_name": string,"source_url"?: string | null
                  }
                  Update: {
                    "accessed_at"?: string,"excerpt"?: string | null,"forecast_id"?: string | null,"id"?: string,"message_id"?: string,"reading_id"?: string | null,"source_name"?: string,"source_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_evidence_forecast_id_fkey"
      columns: ["forecast_id"]
isOneToOne: false
      referencedRelation: "pollution_forecasts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_evidence_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "ai_messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_evidence_reading_id_fkey"
      columns: ["reading_id"]
isOneToOne: false
      referencedRelation: "aqi_readings"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_messages": {
                  Row: {
                    "content": string,"conversation_id": string,"created_at": string,"id": string,"metadata": NonNullable<Json>,"role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"conversation_id": string,"created_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"role": string
                  }
                  Update: {
                    "content"?: string,"conversation_id"?: string,"created_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"role"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "ai_conversations"
      referencedColumns: ["id"]
    }
                  ]
                },"aqi_index_values": {
                  Row: {
                    "aqi_category": string | null,"aqi_scale": string,"aqi_value": number,"dominant_pollutant": string | null,"forecast_id": string | null,"id": string,"reading_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "aqi_category"?: string | null,"aqi_scale": string,"aqi_value": number,"dominant_pollutant"?: string | null,"forecast_id"?: string | null,"id"?: string,"reading_id"?: string | null
                  }
                  Update: {
                    "aqi_category"?: string | null,"aqi_scale"?: string,"aqi_value"?: number,"dominant_pollutant"?: string | null,"forecast_id"?: string | null,"id"?: string,"reading_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "aqi_index_values_forecast_id_fkey"
      columns: ["forecast_id"]
isOneToOne: false
      referencedRelation: "pollution_forecasts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "aqi_index_values_reading_id_fkey"
      columns: ["reading_id"]
isOneToOne: false
      referencedRelation: "aqi_readings"
      referencedColumns: ["id"]
    }
                  ]
                },"aqi_readings": {
                  Row: {
                    "created_at": string,"data_kind": string,"fetched_at": string,"id": string,"location_id": string,"observed_at": string,"payload_id": string | null,"source_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"data_kind": string,"fetched_at"?: string,"id"?: string,"location_id": string,"observed_at": string,"payload_id"?: string | null,"source_id": string
                  }
                  Update: {
                    "created_at"?: string,"data_kind"?: string,"fetched_at"?: string,"id"?: string,"location_id"?: string,"observed_at"?: string,"payload_id"?: string | null,"source_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "aqi_readings_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "aqi_readings_payload_id_fkey"
      columns: ["payload_id"]
isOneToOne: false
      referencedRelation: "provider_payloads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "aqi_readings_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "data_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"civic_reports": {
                  Row: {
                    "ai_classification": Json | null,"category": string,"created_at": string,"description": string | null,"id": string,"latitude": number | null,"location_id": string | null,"longitude": number | null,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_classification"?: Json | null,"category": string,"created_at"?: string,"description"?: string | null,"id"?: string,"latitude"?: number | null,"location_id"?: string | null,"longitude"?: number | null,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "ai_classification"?: Json | null,"category"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"latitude"?: number | null,"location_id"?: string | null,"longitude"?: number | null,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "civic_reports_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"data_sources": {
                  Row: {
                    "attribution": string | null,"created_at": string,"display_name": string,"id": string,"is_active": boolean,"provider": string,"source_type": string,"updated_at": string,"website_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attribution"?: string | null,"created_at"?: string,"display_name": string,"id"?: string,"is_active"?: boolean,"provider": string,"source_type": string,"updated_at"?: string,"website_url"?: string | null
                  }
                  Update: {
                    "attribution"?: string | null,"created_at"?: string,"display_name"?: string,"id"?: string,"is_active"?: boolean,"provider"?: string,"source_type"?: string,"updated_at"?: string,"website_url"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"locations": {
                  Row: {
                    "city": string,"coordinate_source": string,"country_code": string,"created_at": string,"external_ref": string | null,"geom": unknown,"id": string,"is_active": boolean,"latitude": number,"location_type": string,"longitude": number,"name": string,"slug": string,"source_id": string | null,"state": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string,"coordinate_source": string,"country_code"?: string,"created_at"?: string,"external_ref"?: string | null,"geom"?: never,"id"?: string,"is_active"?: boolean,"latitude": number,"location_type": string,"longitude": number,"name": string,"slug": string,"source_id"?: string | null,"state"?: string,"updated_at"?: string
                  }
                  Update: {
                    "city"?: string,"coordinate_source"?: string,"country_code"?: string,"created_at"?: string,"external_ref"?: string | null,"geom"?: never,"id"?: string,"is_active"?: boolean,"latitude"?: number,"location_type"?: string,"longitude"?: number,"name"?: string,"slug"?: string,"source_id"?: string | null,"state"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "locations_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "data_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"pollutant_values": {
                  Row: {
                    "averaging_period": string | null,"forecast_id": string | null,"id": string,"pollutant": string,"reading_id": string | null,"unit": string,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "averaging_period"?: string | null,"forecast_id"?: string | null,"id"?: string,"pollutant": string,"reading_id"?: string | null,"unit": string,"value": number
                  }
                  Update: {
                    "averaging_period"?: string | null,"forecast_id"?: string | null,"id"?: string,"pollutant"?: string,"reading_id"?: string | null,"unit"?: string,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pollutant_values_forecast_id_fkey"
      columns: ["forecast_id"]
isOneToOne: false
      referencedRelation: "pollution_forecasts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pollutant_values_reading_id_fkey"
      columns: ["reading_id"]
isOneToOne: false
      referencedRelation: "aqi_readings"
      referencedColumns: ["id"]
    }
                  ]
                },"pollution_forecasts": {
                  Row: {
                    "created_at": string,"fetched_at": string,"forecast_for": string,"id": string,"issued_at": string,"location_id": string,"payload_id": string | null,"source_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"fetched_at"?: string,"forecast_for": string,"id"?: string,"issued_at": string,"location_id": string,"payload_id"?: string | null,"source_id": string
                  }
                  Update: {
                    "created_at"?: string,"fetched_at"?: string,"forecast_for"?: string,"id"?: string,"issued_at"?: string,"location_id"?: string,"payload_id"?: string | null,"source_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pollution_forecasts_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pollution_forecasts_payload_id_fkey"
      columns: ["payload_id"]
isOneToOne: false
      referencedRelation: "provider_payloads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pollution_forecasts_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "data_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"provider_payloads": {
                  Row: {
                    "endpoint": string,"expires_at": string,"fetched_at": string,"id": string,"payload": NonNullable<Json>,"request_params": NonNullable<Json>,"source_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "endpoint": string,"expires_at"?: string,"fetched_at"?: string,"id"?: string,"payload": NonNullable<Json>,"request_params"?: NonNullable<Json>,"source_id": string
                  }
                  Update: {
                    "endpoint"?: string,"expires_at"?: string,"fetched_at"?: string,"id"?: string,"payload"?: NonNullable<Json>,"request_params"?: NonNullable<Json>,"source_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "provider_payloads_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "data_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"report_media": {
                  Row: {
                    "classification": Json | null,"created_at": string,"id": string,"mime_type": string,"report_id": string,"size_bytes": number,"storage_path": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "classification"?: Json | null,"created_at"?: string,"id"?: string,"mime_type": string,"report_id": string,"size_bytes": number,"storage_path": string,"user_id"?: string
                  }
                  Update: {
                    "classification"?: Json | null,"created_at"?: string,"id"?: string,"mime_type"?: string,"report_id"?: string,"size_bytes"?: number,"storage_path"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "report_media_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "civic_reports"
      referencedColumns: ["id"]
    }
                  ]
                },"user_alerts": {
                  Row: {
                    "created_at": string,"id": string,"location_id": string | null,"message": string,"read_at": string | null,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"location_id"?: string | null,"message": string,"read_at"?: string | null,"type": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"location_id"?: string | null,"message"?: string,"read_at"?: string | null,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_alerts_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"user_preferences": {
                  Row: {
                    "created_at": string,"language": string,"notifications_enabled": boolean,"preferred_activities": (string)[],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"language"?: string,"notifications_enabled"?: boolean,"preferred_activities"?: (string)[],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"language"?: string,"notifications_enabled"?: boolean,"preferred_activities"?: (string)[],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"full_name": string | null,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"full_name"?: string | null,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"full_name"?: string | null,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
