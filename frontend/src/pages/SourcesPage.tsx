import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import { usePermissions } from '@/hooks/usePermissions';
import { useSearchStore } from '@/stores/searchStore';
import styles from './ArtifactsPage.module.css';

interface Source {
  id: string;
  title: string;
  author: string | null;
  publisher: string | null;
  publication_date: string | null;
  url: string | null;
  notes: string | null;
  created_at: string;
}

interface SourceForm {
  title: string;
  author: string;
  publisher: string;
  publication_date: string;
  url: string;
  notes: string;
}

const EMPTY_FORM: SourceForm = {
  title: '',
  author: '',
  publisher: '',
  publication_date: '',
  url: '',
  notes: '',
};

function extractYear(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const m = dateStr.match(/\d{4}/);
  return m ? m[0] : null;
}

const SourcesPage: React.FC = () => {
  const navigate = useNavigate();
  const { canCreate } = usePermissions();
  const globalQuery = useSearchStore((s) => s.globalQuery);
  const [sources, setSources] = useState<Source[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<SourceForm>(EMPTY_FORM);

  const fetchSources = useCallback(async (searchQuery: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      const res = await fetch(`/api/v1/sources?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load sources (${res.status})`);
      const data: { sources?: Source[]; data?: Source[] } = await res.json();
      setSources(data.sources ?? data.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sources');
      setSources([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => fetchSources(globalQuery), 300);
    return () => clearTimeout(debounce);
  }, [globalQuery, fetchSources]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/sources', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          author: form.author.trim() || null,
          publisher: form.publisher.trim() || null,
          publication_date: form.publication_date.trim() || null,
          url: form.url.trim() || null,
          notes: form.notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to create source');
      const created = await res.json() as Source;
      setForm(EMPTY_FORM);
      navigate(`/sources/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create source');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppShell navbar={<Navbar />} context="sources">
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Apex Family Legacy</p>
            <h1>Sources</h1>
            <p className={styles.subtitle}>Documents and records cited as evidence for people and events.</p>
          </div>
          {canCreate && (
            <Button onClick={() => setShowCreate((value) => !value)}>
              {showCreate ? 'Cancel' : 'New Source'}
            </Button>
          )}
        </header>

        {showCreate && (
          <form className={styles.formCard} onSubmit={handleSubmit}>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Title</span>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. 1881 England Census" required />
              </label>
              <label className={styles.field}>
                <span>Author</span>
                <Input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="e.g. John Smith" />
              </label>
              <label className={styles.field}>
                <span>Publisher</span>
                <Input value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} placeholder="e.g. FamilySearch" />
              </label>
              <label className={styles.field}>
                <span>Publication Date</span>
                <Input value={form.publication_date} onChange={(e) => setForm({ ...form, publication_date: e.target.value })} placeholder="e.g. 1881" />
              </label>
              <label className={styles.field}>
                <span>URL</span>
                <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} type="url" placeholder="https://…" />
              </label>
            </div>
            <label className={styles.field}>
              <span>Notes</span>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
            </label>
            <div className={styles.actions}>
              <Button type="submit" loading={isSaving}>Create Source</Button>
            </div>
          </form>
        )}

        {error && <div className={styles.error}>{error}</div>}

        {isLoading ? (
          <div className={styles.empty}>Loading sources...</div>
        ) : sources.length === 0 ? (
          <div className={styles.empty}>
            {globalQuery.trim() ? 'No sources match your search.' : 'No sources yet.'}
          </div>
        ) : (
          <div className={styles.grid}>
            {sources.map((source) => {
              const year = extractYear(source.publication_date);
              return (
                <Link key={source.id} to={`/sources/${source.id}`} className={styles.card}>
                  <div className={styles.cardType}>Source</div>
                  <h2>{source.title}</h2>
                  {source.notes && <p>{source.notes}</p>}
                  <div className={styles.meta}>
                    {source.author && <span>{source.author}</span>}
                    {year && <span>{year}</span>}
                    {source.publisher && <span>{source.publisher}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default SourcesPage;
