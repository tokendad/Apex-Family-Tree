import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import TopolaTree from '@/components/TopolaTree/TopolaTree';
import type { TopolaChartKind } from '@/components/TopolaTree/TopolaTree';
import type { TreeFamily, TreePerson } from '@/stores/canvasStore';
import { DEMO_FAMILIES, DEMO_PERSONS, DEMO_ROOT_ID } from '@/utils/topolaDemoData';
import styles from './TopolaTreePage.module.css';

interface TreeApiResponse {
  persons: TreePerson[];
  families: TreeFamily[];
  home_person_id: string | null;
}

/**
 * Experimental page: the family tree drawn with Topola instead of the
 * hand-rolled layout. Add ?demo=1 to use built-in sample data.
 */
const TopolaTreePage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const demo = params.get('demo') === '1';

  const [persons, setPersons] = useState<TreePerson[]>([]);
  const [families, setFamilies] = useState<TreeFamily[]>([]);
  const [rootId, setRootId] = useState<string | null>(null);
  const [chart, setChart] = useState<TopolaChartKind>('hourglass');
  const [generations, setGenerations] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (demo) {
      setPersons(DEMO_PERSONS);
      setFamilies(DEMO_FAMILIES);
      setRootId(params.get('root') ?? DEMO_ROOT_ID);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/v1/tree?generations=${generations}`, { credentials: 'include' });
        if (res.status === 404) {
          if (!cancelled) { setPersons([]); setFamilies([]); setRootId(null); }
          return;
        }
        if (!res.ok) throw new Error(`Failed to fetch tree data: ${res.statusText}`);
        const data = (await res.json()) as TreeApiResponse;
        if (cancelled) return;
        setPersons(data.persons);
        setFamilies(data.families);
        setRootId(data.home_person_id ?? data.persons[0]?.id ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [demo, generations, params]);

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="tree" />} context="tree">
      <div className={styles.wrap}>
        <div className={styles.toolbar}>
          <span className={styles.badge}>Topola prototype{demo ? ' (demo data)' : ''}</span>
          <label className={styles.control}>
            Chart
            <select value={chart} onChange={(e) => setChart(e.target.value as TopolaChartKind)}>
              <option value="hourglass">Hourglass (ancestors + descendants)</option>
              <option value="relatives">Relatives (everyone connected)</option>
            </select>
          </label>
          {!demo && (
            <label className={styles.control}>
              Generations
              <select value={generations} onChange={(e) => setGenerations(Number(e.target.value))}>
                {[2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
          <span className={styles.hint}>{persons.length} people · {families.length} families · drag to pan, scroll to zoom, click a person to open</span>
        </div>
        <div className={styles.canvas}>
          {loading && <div className={styles.message}>Loading tree…</div>}
          {error && <div className={styles.message}>{error}</div>}
          {!loading && !error && persons.length === 0 && (
            <div className={styles.message}>No family members yet.</div>
          )}
          {!loading && !error && persons.length > 0 && (
            <TopolaTree
              persons={persons}
              families={families}
              startPersonId={rootId}
              chart={chart}
              onSelectPerson={(id) => { if (!demo) navigate(`/people/${id}`); }}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
};

export default TopolaTreePage;
