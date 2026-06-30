import type { ArchiveObjectType, ArchivePrivacyLevel } from './archive.js';

export interface ArchiveSearchResult {
  id: string;
  object_type: ArchiveObjectType;
  title: string;
  summary: string | null;
  privacy_level: ArchivePrivacyLevel;
  updated_at: string;
  rank: number | null;
}

export interface ArchiveSearchResponse {
  data: ArchiveSearchResult[];
  total_count: number;
}
