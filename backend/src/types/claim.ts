import type { ArchiveObject, ArchiveObjectType, ArchivePrivacyLevel } from './archive.js';

export type ClaimStatus = 'open' | 'supported' | 'conflicted' | 'rejected' | 'unknown';
export type EvidenceRole = 'supports' | 'contradicts' | 'mentions' | 'uncertain';

export interface ClaimRecord {
  id: string;
  object_type: ArchiveObject['object_type'];
  title: string;
  summary: string | null;
  privacy_level: ArchivePrivacyLevel;
  is_deleted: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  statement: string;
  claim_type: string | null;
  subject_object_id: string | null;
  date_text: string | null;
  date_start: string | null;
  date_end: string | null;
  confidence_level_id: string | null;
  confidence_score: number | null;
  status: ClaimStatus;
  notes: string | null;
  confidence_level_name: string | null;
  subject_title: string | null;
  evidence_count: number;
}

export interface ClaimSubjectRecord {
  id: string;
  claim_id: string;
  subject_object_id: string;
  role: string;
  object_type: ArchiveObjectType;
  title: string;
  summary: string | null;
}

export interface ClaimEvidenceRecord {
  id: string;
  claim_id: string;
  evidence_object_id: string;
  evidence_role: EvidenceRole;
  evidence_classification_id: string | null;
  excerpt: string | null;
  locator: string | null;
  weight_score: number | null;
  confidence_contribution: number | null;
  notes: string | null;
  object_type: ArchiveObjectType;
  title: string;
  summary: string | null;
  evidence_classification_name: string | null;
}

export interface ConfidenceLevelRecord {
  id: string;
  name: string;
  description: string | null;
  numeric_value: number | null;
  is_system: number;
  sort_order: number;
}

export interface CreateClaimInput {
  statement: string;
  title?: string;
  summary?: string | null;
  privacy_level?: ArchivePrivacyLevel;
  claim_type?: string | null;
  subject_object_id?: string | null;
  date_text?: string | null;
  date_start?: string | null;
  date_end?: string | null;
  confidence_level_id?: string | null;
  confidence_score?: number | null;
  status?: ClaimStatus;
  notes?: string | null;
  created_by?: string | null;
}

export type UpdateClaimInput = Partial<Omit<CreateClaimInput, 'created_by'>> & {
  updated_by?: string | null;
};

export interface AddClaimEvidenceInput {
  evidence_object_id: string;
  evidence_role?: EvidenceRole;
  evidence_classification_id?: string | null;
  excerpt?: string | null;
  locator?: string | null;
  weight_score?: number | null;
  confidence_contribution?: number | null;
  notes?: string | null;
}
