import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import { usePermissions } from '@/hooks/usePermissions';
import { useSearchStore } from '@/stores/searchStore';
import styles from './ArtifactsPage.module.css';

interface StoryRecord {
  id: string;
  title: string;
  summary: string | null;
  story_type: 'story' | 'memory' | 'oral_history' | 'note';
  date_text: string | null;
  narrator_title: string | null;
  connection_count: number;
}

const EMPTY_FORM = { title: '', summary: '', story_type: 'story' as StoryRecord['story_type'], body_markdown: '', narrator_person_id: '', date_text: '' };

const StoriesPage: React.FC = () => {
  const navigate = useNavigate();
  const { canCreate } = usePermissions();
  const globalQuery = useSearchStore((state) => state.globalQuery);
  const [stories, setStories] = useState<StoryRecord[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showCreate, setShowCreate] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStories = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (globalQuery.trim()) params.set('q', globalQuery.trim());
      const res = await fetch(`/api/v1/stories?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load stories');
      const json = await res.json() as { data: StoryRecord[] };
      setStories(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stories');
    } finally {
      setIsLoading(false);
    }
  }, [globalQuery]);

  useEffect(() => { void loadStories(); }, [loadStories]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          summary: form.summary.trim() || null,
          story_type: form.story_type,
          body_markdown: form.body_markdown,
          narrator_person_id: form.narrator_person_id.trim() || null,
          date_text: form.date_text.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to create story');
      const created = await res.json() as StoryRecord;
      setForm(EMPTY_FORM);
      navigate(`/stories/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create story');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="stories" />} context="stories">
      <div className={styles.page}>
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>Apex Family Legacy</p><h1>Stories</h1><p className={styles.subtitle}>Preserve memories, oral histories, explanations, and narrative context that structured records cannot hold.</p></div>
          {canCreate && <Button onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Cancel' : 'New Story'}</Button>}
        </header>

        {showCreate && <form className={styles.formCard} onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            <label className={styles.field}><span>Title</span><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
            <label className={styles.field}><span>Summary</span><Input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></label>
            <label className={styles.field}><span>Type</span><select value={form.story_type} onChange={(e) => setForm({ ...form, story_type: e.target.value as StoryRecord['story_type'] })}><option value="story">Story</option><option value="memory">Memory</option><option value="oral_history">Oral History</option><option value="note">Note</option></select></label>
            <label className={styles.field}><span>Narrator Person ID</span><Input value={form.narrator_person_id} onChange={(e) => setForm({ ...form, narrator_person_id: e.target.value })} /></label>
            <label className={styles.field}><span>Date</span><Input value={form.date_text} onChange={(e) => setForm({ ...form, date_text: e.target.value })} /></label>
          </div>
          <label className={styles.field}><span>Story Markdown</span><textarea value={form.body_markdown} onChange={(e) => setForm({ ...form, body_markdown: e.target.value })} rows={8} required /></label>
          <div className={styles.actions}><Button type="submit" loading={isSaving}>Create Story</Button></div>
        </form>}

        {error && <div className={styles.error}>{error}</div>}
        {isLoading ? <div className={styles.empty}>Loading stories...</div> : stories.length === 0 ? <div className={styles.empty}>No stories yet. Add a memory, oral history, or explanation to begin preserving narrative context.</div> : (
          <div className={styles.grid}>{stories.map((story) => <Link key={story.id} to={`/stories/${story.id}`} className={styles.card}><div className={styles.cardType}>{story.story_type.replace('_', ' ')}</div><h2>{story.title}</h2>{story.summary && <p>{story.summary}</p>}<div className={styles.meta}>{story.date_text && <span>{story.date_text}</span>}{story.narrator_title && <span>{story.narrator_title}</span>}<span>{story.connection_count} connection{story.connection_count === 1 ? '' : 's'}</span></div></Link>)}</div>
        )}
      </div>
    </AppShell>
  );
};

export default StoriesPage;
