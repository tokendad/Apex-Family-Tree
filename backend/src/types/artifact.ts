import type { ArchiveObject, ArchivePrivacyLevel } from './archive.js';

export interface Artifact {
  id: string;
  artifact_type_id: string;
  evidence_classification_id: string | null;
  original_date_text: string | null;
  original_date_start: string | null;
  original_date_end: string | null;
  date_precision: string | null;
  date_qualifier: string | null;
  creator_text: string | null;
  physical_location: string | null;
  original_format: string | null;
  condition_notes: string | null;
  language: string | null;
  transcription: string | null;
  notes: string | null;
}

export interface ArtifactType {
  id: string;
  parent_type_id: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  is_system: number;
  sort_order: number;
}

export interface EvidenceClassification {
  id: string;
  name: string;
  description: string | null;
  default_weight: number | null;
  is_system: number;
  sort_order: number;
}

export interface ArtifactRecord extends Artifact {
  object_type: ArchiveObject['object_type'];
  title: string;
  summary: string | null;
  privacy_level: ArchivePrivacyLevel;
  is_deleted: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  artifact_type_name: string;
  evidence_classification_name: string | null;
}

export interface CreateArtifactInput {
  title: string;
  summary?: string | null;
  privacy_level?: ArchivePrivacyLevel;
  artifact_type_id: string;
  evidence_classification_id?: string | null;
  original_date_text?: string | null;
  original_date_start?: string | null;
  original_date_end?: string | null;
  date_precision?: string | null;
  date_qualifier?: string | null;
  creator_text?: string | null;
  physical_location?: string | null;
  original_format?: string | null;
  condition_notes?: string | null;
  language?: string | null;
  transcription?: string | null;
  notes?: string | null;
  created_by?: string | null;
}

export type UpdateArtifactInput = Partial<Omit<CreateArtifactInput, 'created_by'>> & {
  updated_by?: string | null;
};
