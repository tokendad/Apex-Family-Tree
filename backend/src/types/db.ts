// ─── User & Auth ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: 'admin' | 'editor' | 'limited_editor' | 'viewer';
  status: 'active' | 'inactive' | 'suspended';
  home_person_id: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InviteToken {
  id: string;
  token: string;
  email: string;
  role: User['role'];
  invited_by: string;
  message: string | null;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
}

export interface PasswordResetToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

// ─── Core Genealogy ─────────────────────────────────────────────────────────

export interface Person {
  id: string;
  sex: 'M' | 'F' | 'X' | 'U';
  is_living: number; // SQLite boolean
  is_private: number;
  gedcom_id: string | null;
  notes: string | null;
  display_name: string | null; // Per-person name format override
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Name {
  id: string;
  person_id: string;
  name_type: 'birth' | 'married' | 'aka' | 'nickname' | 'formal' | 'religious';
  prefix: string | null;
  given_name: string | null;
  middle_name: string | null; // New field for middle name
  surname: string | null;
  suffix: string | null;
  nickname: string | null; // New field for nickname
  is_primary: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Family {
  id: string;
  spouse1_id: string | null;
  spouse2_id: string | null;
  marriage_date: string | null;
  marriage_date_qualifier: string | null;
  marriage_date_sort_key: number | null;
  marriage_place: string | null;
  divorce_date: string | null;
  divorce_place: string | null;
  gedcom_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  person_id: string;
  event_type: string;
  event_date: string | null;
  event_date_qualifier: string | null;
  event_date_sort_key: number | null;
  event_place: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface FamilyMember {
  id: string;
  family_id: string;
  person_id: string;
  role: 'child' | 'adopted' | 'foster' | 'step';
  sort_order: number;
  created_at: string;
}

// ─── Sources ────────────────────────────────────────────────────────────────

export interface SourceRepository {
  id: string;
  name: string;
  address: string | null;
  url: string | null;
  notes: string | null;
  gedcom_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Source {
  id: string;
  repository_id: string | null;
  title: string;
  author: string | null;
  publisher: string | null;
  publication_date: string | null;
  url: string | null;
  notes: string | null;
  gedcom_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceCitation {
  id: string;
  source_id: string;
  person_id: string | null;
  event_id: string | null;
  page: string | null;
  quality: 'primary' | 'secondary' | 'questionable' | 'unreliable' | null;
  notes: string | null;
  created_at: string;
}

// ─── Media ──────────────────────────────────────────────────────────────────

export interface MediaItem {
  id: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  file_path: string;
  thumbnail_path: string | null;
  title: string | null;
  description: string | null;
  date_taken: string | null;
  uploaded_by: string | null;
  is_external: number;
  created_at: string;
  updated_at: string;
}

export interface PersonMedia {
  person_id: string;
  media_id: string;
  is_primary: number;
  sort_order: number;
  created_at: string;
}

export interface FamilyMedia {
  family_id: string;
  media_id: string;
  sort_order: number;
  created_at: string;
}

export interface EventMedia {
  event_id: string;
  media_id: string;
  sort_order: number;
  created_at: string;
}

export interface MediaPersonRegion {
  id: string;
  media_id: string;
  person_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ─── GEDCOM Import / Export ─────────────────────────────────────────────────

export interface ImportJob {
  id: string;
  user_id: string;
  filename: string;
  file_size: number;
  gedcom_version: string | null;
  status: 'pending' | 'validating' | 'awaiting_review' | 'processing' | 'completed' | 'failed' | 'cancelled';
  total_records: number;
  processed_records: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface GedcomXrefMap {
  id: string;
  import_job_id: string;
  xref: string;
  record_type: 'INDI' | 'FAM' | 'SOUR' | 'REPO' | 'OBJE' | 'NOTE';
  internal_id: string;
  internal_table: string;
  created_at: string;
}

export interface ImportConflict {
  id: string;
  import_job_id: string;
  xref: string;
  record_type: string;
  field_name: string;
  existing_value: string | null;
  incoming_value: string | null;
  resolution: 'skip' | 'overwrite' | 'merge' | null;
  resolved_at: string | null;
  created_at: string;
}

export interface ImportAuditLog {
  id: number;
  import_job_id: string;
  action: 'created' | 'updated' | 'skipped' | 'merged' | 'error';
  record_type: string;
  xref: string | null;
  internal_id: string | null;
  details: string | null;
  created_at: string;
}

export interface ExportJob {
  id: string;
  user_id: string;
  gedcom_version: '5.5.1' | '7.0';
  scope: 'full' | 'ancestors' | 'descendants' | 'date_range';
  scope_person_id: string | null;
  scope_start_date: string | null;
  scope_end_date: string | null;
  media_option: 'zip' | 'base64' | 'links';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  file_path: string | null;
  total_records: number;
  error_message: string | null;
  completed_at: string | null;
  created_at: string;
}

// ─── Settings ───────────────────────────────────────────────────────────────

export interface AppSetting {
  key: string;
  value: string | null;
  value_type: 'string' | 'number' | 'boolean' | 'json' | 'encrypted';
  description: string | null;
  updated_at: string;
}

export interface FeatureFlag {
  key: string;
  enabled: number;
  description: string | null;
  updated_at: string;
}

// ─── Audit & Backup ────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: number;
  user_id: string | null;
  action: 'create' | 'update' | 'delete';
  entity_type: string;
  entity_id: string;
  old_values: string | null;
  new_values: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface BackupLogEntry {
  id: number;
  backup_type: 'startup' | 'pre_migration' | 'scheduled' | 'manual' | 'pre_import';
  filename: string;
  file_size: number | null;
  status: 'started' | 'completed' | 'failed';
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

// ─── Convenience / API types ────────────────────────────────────────────────

export type SafeUser = Omit<User, 'password_hash'>;

export interface PersonWithNames extends Person {
  names: Name[];
  primary_name?: Name;
  /** Flat convenience fields populated on list responses (from primary_name) */
  given_name?: string | null;
  surname?: string | null;
  /** Formatted name using global name_display_format or person's display_name override */
  displayName?: string;
}

export interface SpouseNameSummary {
  id: string;
  displayName?: string;
  display_name?: string | null;
  given_name: string | null;
  middle_name?: string | null;
  surname: string | null;
}

export interface FamilyWithSpouseNames extends Family {
  spouse1: SpouseNameSummary | null;
  spouse2: SpouseNameSummary | null;
}

export interface PersonWithRelations extends PersonWithNames {
  events: Event[];
  families: Family[];
  media: MediaItem[];
}
