import type { ArchivePrivacyLevel } from './archive.js';

export interface PlaceRecord {
  id: string;
  object_type: 'place';
  title: string;
  summary: string | null;
  privacy_level: ArchivePrivacyLevel;
  is_deleted: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  normalized_name: string;
  place_type: string | null;
  address_text: string | null;
  locality: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
}

export interface PlaceAliasRecord {
  id: string;
  place_id: string;
  alias: string;
  source: string | null;
  sort_order: number;
  created_at: string;
}

export interface CreatePlaceInput {
  title: string;
  summary?: string | null;
  privacy_level?: ArchivePrivacyLevel;
  normalized_name?: string | null;
  place_type?: string | null;
  address_text?: string | null;
  locality?: string | null;
  region?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
  aliases?: string[];
  created_by?: string | null;
}

export interface UpdatePlaceInput extends Partial<Omit<CreatePlaceInput, 'created_by'>> {
  updated_by?: string | null;
}
