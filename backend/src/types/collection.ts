import type { ArchiveObject, ArchiveObjectType, ArchivePrivacyLevel } from './archive.js';

export interface Collection {
  id: string;
  collection_type: 'manual' | 'smart';
  description: string | null;
  cover_artifact_id: string | null;
  sort_order: number;
}

export interface CollectionRecord extends Collection {
  object_type: ArchiveObject['object_type'];
  title: string;
  summary: string | null;
  privacy_level: ArchivePrivacyLevel;
  is_deleted: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  item_count: number;
}

export interface CollectionItemRecord {
  id: string;
  collection_id: string;
  item_object_id: string;
  caption: string | null;
  sort_order: number;
  added_at: string;
  added_by: string | null;
  object_type: ArchiveObjectType;
  title: string;
  summary: string | null;
}

export interface TagRecord {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
}

export interface CreateCollectionInput {
  title: string;
  summary?: string | null;
  privacy_level?: ArchivePrivacyLevel;
  collection_type?: 'manual' | 'smart';
  description?: string | null;
  cover_artifact_id?: string | null;
  sort_order?: number;
  created_by?: string | null;
}

export type UpdateCollectionInput = Partial<Omit<CreateCollectionInput, 'created_by'>> & {
  updated_by?: string | null;
};

export interface AddCollectionItemInput {
  item_object_id: string;
  caption?: string | null;
  sort_order?: number;
  added_by?: string | null;
}
