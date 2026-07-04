import type { ArchiveObject, ArchivePrivacyLevel } from './archive.js';
import type { ConnectedObjectRecord } from './relationship.js';

export type StoryType = 'story' | 'memory' | 'oral_history' | 'note';

export interface StoryRecord {
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
  story_type: StoryType;
  body_markdown: string;
  narrator_person_id: string | null;
  recorded_by_user_id: string | null;
  date_text: string | null;
  date_start: string | null;
  date_end: string | null;
  notes: string | null;
  narrator_title: string | null;
  connection_count: number;
}

export interface StoryDetail extends StoryRecord {
  connected_objects: ConnectedObjectRecord[];
}

export interface CreateStoryInput {
  title: string;
  summary?: string | null;
  privacy_level?: ArchivePrivacyLevel;
  story_type?: StoryType;
  body_markdown: string;
  narrator_person_id?: string | null;
  recorded_by_user_id?: string | null;
  date_text?: string | null;
  date_start?: string | null;
  date_end?: string | null;
  notes?: string | null;
  created_by?: string | null;
}

export type UpdateStoryInput = Partial<Omit<CreateStoryInput, 'created_by'>> & {
  updated_by?: string | null;
};
