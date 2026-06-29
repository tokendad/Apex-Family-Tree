export type ArchiveObjectType =
  | 'person'
  | 'artifact'
  | 'event'
  | 'place'
  | 'story'
  | 'collection'
  | 'claim'
  | 'relationship';

export type ArchivePrivacyLevel = 'public' | 'family' | 'private' | 'restricted';

export interface ArchiveObject {
  id: string;
  object_type: ArchiveObjectType;
  title: string;
  summary: string | null;
  privacy_level: ArchivePrivacyLevel;
  is_deleted: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateArchiveObjectInput {
  id?: string;
  object_type: ArchiveObjectType;
  title: string;
  summary?: string | null;
  privacy_level?: ArchivePrivacyLevel;
  created_by?: string | null;
}

export interface UpdateArchiveObjectInput {
  title?: string;
  summary?: string | null;
  privacy_level?: ArchivePrivacyLevel;
  updated_by?: string | null;
}

export interface ArchiveObjectListOptions {
  limit?: number;
  cursor?: string;
  includeDeleted?: boolean;
}
