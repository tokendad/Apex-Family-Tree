import type { ArchiveObject, ArchiveObjectType } from './archive.js';

export interface RelationshipType {
  id: string;
  code: string;
  name: string;
  inverse_name: string | null;
  category: string | null;
  description: string | null;
  is_system: number;
  is_directional: number;
  is_tree_relevant: number;
  default_confidence_id: string | null;
  sort_order: number;
}

export interface RelationshipTypeRole {
  id: string;
  relationship_type_id: string;
  role: string;
  allowed_object_type: ArchiveObjectType;
  min_count: number;
  max_count: number | null;
  sort_order: number;
  is_required: number;
}

export interface Relationship {
  id: string;
  relationship_type_id: string;
  label: string | null;
  description: string | null;
  date_text: string | null;
  date_start: string | null;
  date_end: string | null;
  date_precision: string | null;
  date_qualifier: string | null;
  confidence_level_id: string | null;
  confidence_score: number | null;
  notes: string | null;
}

export interface RelationshipMember {
  id: string;
  relationship_id: string;
  object_id: string;
  role: string;
  sort_order: number;
  notes: string | null;
}

export interface RelationshipMemberInput {
  object_id: string;
  role: string;
  sort_order?: number;
  notes?: string | null;
}

export interface CreateRelationshipInput {
  relationship_type_id?: string;
  relationship_type_code?: string;
  label?: string | null;
  description?: string | null;
  date_text?: string | null;
  date_start?: string | null;
  date_end?: string | null;
  date_precision?: string | null;
  date_qualifier?: string | null;
  confidence_level_id?: string | null;
  confidence_score?: number | null;
  notes?: string | null;
  created_by?: string | null;
  members: RelationshipMemberInput[];
}

export interface RelationshipRecord extends Relationship {
  object_type: ArchiveObject['object_type'];
  title: string;
  summary: string | null;
  privacy_level: ArchiveObject['privacy_level'];
  is_deleted: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  relationship_type_code: string;
  relationship_type_name: string;
  members: RelationshipMemberRecord[];
}

export interface RelationshipMemberRecord extends RelationshipMember {
  object_type: ArchiveObjectType;
  object_title: string;
}

export interface ConnectedObjectRecord {
  relationship_id: string;
  relationship_type_code: string;
  relationship_type_name: string;
  role: string;
  object_id: string;
  object_type: ArchiveObjectType;
  title: string;
  summary: string | null;
  artifact_type_name: string | null;
}
