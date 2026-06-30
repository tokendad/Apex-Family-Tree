import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import styles from './ArtifactsPage.module.css';

interface SearchResult {
  id: string;
  object_type: string;
  title: string;
  summary: string | null;
  privacy_level: string;
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

const SearchPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setResults([]);
      setTotalCount(0);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: trimmed, limit: '50' });
      const res = await fetch(`/api/v1/search?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to search archive');
      const json = await res.json() as { data: SearchResult[]; total_count: number };
      setResults(json.data);
      setTotalCount(json.total_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search archive');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const current = searchParams.get('q') ?? '';
    setQuery(current);
    void runSearch(current);
  }, [runSearch, searchParams]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    setSearchParams(trimmed ? { q: trimmed } : {});
  };

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="search" />} context="search">
      <div className={styles.page}>
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>Apex Family Legacy</p><h1>Archive Search</h1><p className={styles.subtitle}>Search people, artifacts, events, places, stories, claims, collections, tags, names, and transcriptions.</p></div>
        </header>

        <form className={styles.formCard} onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            <label className={styles.field}><span>Search archive</span><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try a name, tag, place, story text, or artifact transcription" /></label>
          </div>
          <div className={styles.actions}><Button type="submit" loading={isLoading}>Search</Button></div>
        </form>

        {error && <div className={styles.error}>{error}</div>}
        {!searchParams.get('q') ? <div className={styles.empty}>Enter a search term to explore the archive.</div> : isLoading ? <div className={styles.empty}>Searching archive...</div> : results.length === 0 ? <div className={styles.empty}>No archive results found.</div> : <>
          <p className={styles.muted}>{totalCount} result{totalCount === 1 ? '' : 's'}</p>
          <div className={styles.grid}>{results.map((result) => <Link key={result.id} to={objectPath(result.object_type, result.id)} className={styles.card}><div className={styles.cardType}>{result.object_type}</div><h2>{result.title}</h2>{result.summary && <p>{result.summary}</p>}<div className={styles.meta}><span>{result.privacy_level}</span></div></Link>)}</div>
        </>}
      </div>
    </AppShell>
  );
};

export default SearchPage;
