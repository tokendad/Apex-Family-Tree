import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import FamilyChartTree from '@/components/FamilyChartTree/FamilyChartTree';
import ContextMenu from '@/components/ContextMenu/ContextMenu';
import PersonEditModal from '@/components/PersonEditModal/PersonEditModal';
import { useCanvasStore } from '@/stores/canvasStore';
import type { FamilyChartOrientation } from '@/components/FamilyChartTree/FamilyChartTree';
import type { TreeFamily, TreePerson } from '@/stores/canvasStore';
import { DEMO_FAMILIES, DEMO_PERSONS, DEMO_ROOT_ID } from '@/utils/topolaDemoData';
import styles from './TopolaTreePage.module.css';

interface TreeApiResponse {
  persons: TreePerson[];
  families: TreeFamily[];
  home_person_id: string | null;
}

/**
 * Experimental page: the family tree drawn with family-chart. Add ?demo=1 for
 * built-in sample data (shared with the Topola prototype) and ?root=<id> to
 * choose the initial person.
 */
const FamilyChartTreePage: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const demo = params.get('demo') === '1';
  const setContextMenu = useCanvasStore((state) => state.setContextMenu);
  const [editPersonId, setEditPersonId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [persons, setPersons] = useState<TreePerson[]>([]);
  const [families, setFamilies] = useState<TreeFamily[]>([]);
  const [rootId, setRootId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<FamilyChartOrientation>('vertical');
  const [depth, setDepth] = useState(3);
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
        setRootId(params.get('root') ?? data.home_person_id ?? data.persons[0]?.id ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [demo, generations, params, reloadToken]);

  const focused = useMemo(() => persons.find((p) => p.id === focusId) ?? null, [persons, focusId]);
  const editing = useMemo(
    () => persons.find((p) => p.id === editPersonId) ?? null,
    [persons, editPersonId],
  );
  const editingName = editing
    ? [editing.given_name, editing.surname].filter(Boolean).join(' ')
    : '';
  const focusedName = focused ? [focused.given_name, focused.surname].filter(Boolean).join(' ') : '';

  return (
    <AppShell navbar={<Navbar />} sidebar={demo ? undefined : <Sidebar context="tree" />} context="tree">
      <div className={styles.wrap}>
        <div className={styles.toolbar}>
          <span className={styles.badge}>family-chart prototype{demo ? ' (demo data)' : ''}</span>
          <label className={styles.control}>
            Layout
            <select value={orientation} onChange={(e) => setOrientation(e.target.value as FamilyChartOrientation)}>
              <option value="vertical">Vertical</option>
              <option value="horizontal">Horizontal</option>
            </select>
          </label>
          <label className={styles.control}>
            Depth
            <select value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {!demo && (
            <label className={styles.control}>
              Load generations
              <select value={generations} onChange={(e) => setGenerations(Number(e.target.value))}>
                {[2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
          {focused && !demo && <Link to={`/people/${focused.id}`}>Open {focusedName}</Link>}
          {focused && demo && <span>Focused: {focusedName}</span>}
          <span className={styles.hint}>{persons.length} people · drag to pan, scroll to zoom, click a card to centre on that person</span>
        </div>
        <div className={styles.canvas}>
          {loading && <div className={styles.message}>Loading tree…</div>}
          {error && <div className={styles.message}>{error}</div>}
          {!loading && !error && persons.length === 0 && (
            <div className={styles.message}>No family members yet.</div>
          )}
          {!loading && !error && persons.length > 0 && (
            <FamilyChartTree
              persons={persons}
              families={families}
              mainPersonId={rootId}
              orientation={orientation}
              ancestryDepth={depth}
              progenyDepth={depth}
              onMainChange={setFocusId}
              onPersonOpen={(id) => navigate(`/people/${id}`)}
              onPersonContextMenu={(id, x, y) => setContextMenu({ x, y, personId: id })}
            />
          )}
        </div>
      </div>

      {/* This page has no detail panel, so View Details navigates. Adding
          relatives belongs to the main tree's wizard, which this prototype
          does not carry, so those entries are hidden rather than shown dead. */}
      <ContextMenu
        hideUnavailable
        onViewDetails={(id) => navigate(`/people/${id}`)}
        onEditPerson={setEditPersonId}
      />
      <PersonEditModal
        open={editPersonId !== null}
        personId={editPersonId}
        displayName={editingName}
        onClose={() => setEditPersonId(null)}
        onSaved={() => {
          setEditPersonId(null);
          // Re-read the tree so an edited name or date shows on the card.
          setReloadToken((n) => n + 1);
        }}
      />
    </AppShell>
  );
};

export default FamilyChartTreePage;
