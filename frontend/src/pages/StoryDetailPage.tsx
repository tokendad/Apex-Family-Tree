import React, { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import { usePermissions } from '@/hooks/usePermissions';
import styles from './ArtifactsPage.module.css';

interface ConnectedObject { relationship_id: string; object_id: string; object_type: string; title: string; summary: string | null }
interface StoryRecord {
  id: string;
  title: string;
  summary: string | null;
  privacy_level: 'public' | 'family' | 'private' | 'restricted';
  story_type: 'story' | 'memory' | 'oral_history' | 'note';
  body_markdown: string;
  narrator_person_id: string | null;
  narrator_title: string | null;
  date_text: string | null;
  notes: string | null;
  connected_objects: ConnectedObject[];
}

function objectPath(type: string, id: string): string {
  if (type === 'person') return `/people/${id}`;
  if (type === 'artifact') return `/artifacts/${id}`;
  if (type === 'event') return `/events/${id}`;
  if (type === 'place') return `/places/${id}`;
  if (type === 'collection') return `/collections/${id}`;
  if (type === 'claim') return `/claims/${id}`;
  if (type === 'story') return `/stories/${id}`;
  return '#';
}

function formFromStory(story: StoryRecord) {
  return {
    title: story.title,
    summary: story.summary ?? '',
    privacy_level: story.privacy_level,
    story_type: story.story_type,
    body_markdown: story.body_markdown,
    narrator_person_id: story.narrator_person_id ?? '',
    date_text: story.date_text ?? '',
    notes: story.notes ?? '',
  };
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={index}>{part.slice(2, -2)}</strong>
    : <React.Fragment key={index}>{part}</React.Fragment>);
}

function renderMarkdown(markdown: string): ReactNode[] {
  return markdown.split('\n').map((line, index) => {
    if (line.startsWith('### ')) return <h3 key={index}>{renderInline(line.slice(4))}</h3>;
    if (line.startsWith('## ')) return <h2 key={index}>{renderInline(line.slice(3))}</h2>;
    if (line.startsWith('# ')) return <h1 key={index}>{renderInline(line.slice(2))}</h1>;
    if (line.startsWith('- ')) return <p key={index}>• {renderInline(line.slice(2))}</p>;
    if (line.trim() === '') return <br key={index} />;
    return <p key={index}>{renderInline(line)}</p>;
  });
}

const StoryDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit, canDelete } = usePermissions();
  const [story, setStory] = useState<StoryRecord | null>(null);
  const [form, setForm] = useState<ReturnType<typeof formFromStory> | null>(null);
  const [objectId, setObjectId] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [collectionCaption, setCollectionCaption] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStory = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/stories/${id}`);
      if (!res.ok) throw new Error('Story not found');
      const json = await res.json() as StoryRecord;
      setStory(json);
      setForm(formFromStory(json));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load story');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { void loadStory(); }, [loadStory]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !form) return;
    const res = await fetch(`/api/v1/stories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title.trim(),
        summary: form.summary.trim() || null,
        privacy_level: form.privacy_level,
        story_type: form.story_type,
        body_markdown: form.body_markdown,
        narrator_person_id: form.narrator_person_id.trim() || null,
        date_text: form.date_text.trim() || null,
        notes: form.notes.trim() || null,
      }),
    });
    if (res.ok) {
      setEditMode(false);
      await loadStory();
    }
  };

  const handleDelete = async () => {
    if (!id || !window.confirm('Delete this story?')) return;
    const res = await fetch(`/api/v1/stories/${id}`, { method: 'DELETE' });
    if (res.ok) navigate('/stories');
  };

  const handleConnectObject = async () => {
    if (!id || !objectId.trim()) return;
    const res = await fetch(`/api/v1/stories/${id}/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ object_id: objectId.trim() }),
    });
    if (res.ok) {
      setObjectId('');
      await loadStory();
    }
  };

  const handleAddToCollection = async () => {
    if (!id || !collectionId.trim()) return;
    const res = await fetch(`/api/v1/collections/${collectionId.trim()}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_object_id: id, caption: collectionCaption.trim() || null }),
    });
    if (res.ok) {
      setCollectionId('');
      setCollectionCaption('');
    }
  };

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="stories" />} context="stories">
      <div className={styles.page}>
        <Link className={styles.backLink} to="/stories">Back to stories</Link>
        {isLoading ? <div className={styles.empty}>Loading story...</div> : error || !story || !form ? <div className={styles.error}>{error ?? 'Story not found'}</div> : <>
          <header className={styles.header}><div><p className={styles.eyebrow}>{story.story_type.replace('_', ' ')}</p><h1>{story.title}</h1>{story.summary && <p className={styles.subtitle}>{story.summary}</p>}</div><div className={styles.actions}>{canEdit && <Button variant="ghost" onClick={() => setEditMode((value) => !value)}>{editMode ? 'Cancel' : 'Edit'}</Button>}{canDelete && <Button variant="danger" onClick={handleDelete}>Delete</Button>}</div></header>

          {editMode ? <form className={styles.formCard} onSubmit={handleSave}>
            <div className={styles.formGrid}>
              <label className={styles.field}><span>Title</span><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
              <label className={styles.field}><span>Summary</span><Input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></label>
              <label className={styles.field}><span>Type</span><select value={form.story_type} onChange={(e) => setForm({ ...form, story_type: e.target.value as StoryRecord['story_type'] })}><option value="story">Story</option><option value="memory">Memory</option><option value="oral_history">Oral History</option><option value="note">Note</option></select></label>
              <label className={styles.field}><span>Privacy</span><select value={form.privacy_level} onChange={(e) => setForm({ ...form, privacy_level: e.target.value as StoryRecord['privacy_level'] })}><option value="family">Family</option><option value="private">Private</option><option value="restricted">Restricted</option><option value="public">Public</option></select></label>
              <label className={styles.field}><span>Narrator Person ID</span><Input value={form.narrator_person_id} onChange={(e) => setForm({ ...form, narrator_person_id: e.target.value })} /></label>
              <label className={styles.field}><span>Date</span><Input value={form.date_text} onChange={(e) => setForm({ ...form, date_text: e.target.value })} /></label>
            </div>
            <label className={styles.field}><span>Story Markdown</span><textarea value={form.body_markdown} onChange={(e) => setForm({ ...form, body_markdown: e.target.value })} rows={10} required /></label>
            <label className={styles.field}><span>Notes</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></label>
            <div className={styles.actions}><Button type="submit">Save Story</Button></div>
          </form> : <section className={styles.detailCard}><div className={styles.detailRow}><span>Narrator</span><strong>{story.narrator_title || '-'}</strong></div><div className={styles.detailRow}><span>Date</span><strong>{story.date_text || '-'}</strong></div><div className={styles.detailRow}><span>Privacy</span><strong>{story.privacy_level}</strong></div></section>}

          <section className={styles.detailCard}><div className={styles.sectionTitleRow}><h2>Story</h2></div><div>{renderMarkdown(story.body_markdown)}</div></section>

          <section className={styles.detailCard}>
            <div className={styles.sectionTitleRow}><h2>Connected Objects</h2></div>
            {story.connected_objects.length === 0 ? <p className={styles.muted}>No archive objects connected yet.</p> : <div className={styles.connectedList}>{story.connected_objects.map((object) => <Link key={`${object.relationship_id}-${object.object_id}`} className={styles.connectedItem} to={objectPath(object.object_type, object.object_id)}><strong>{object.title}</strong><span>{object.object_type}</span></Link>)}</div>}
            {canEdit && <div className={styles.connectBox}><Input placeholder="Archive object ID" value={objectId} onChange={(event) => setObjectId(event.target.value)} /><Button onClick={handleConnectObject}>Connect Object</Button></div>}
          </section>

          {canEdit && <section className={styles.detailCard}><div className={styles.sectionTitleRow}><h2>Add to Collection</h2></div><div className={styles.connectBox}><Input placeholder="Collection ID" value={collectionId} onChange={(event) => setCollectionId(event.target.value)} /><Input placeholder="Caption" value={collectionCaption} onChange={(event) => setCollectionCaption(event.target.value)} /><Button onClick={handleAddToCollection}>Add Story to Collection</Button></div></section>}
        </>}
      </div>
    </AppShell>
  );
};

export default StoryDetailPage;
