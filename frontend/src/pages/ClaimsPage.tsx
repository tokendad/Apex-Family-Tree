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

interface ClaimRecord {
  id: string;
  title: string;
  statement: string;
  status: 'open' | 'supported' | 'conflicted' | 'rejected' | 'unknown';
  subject_title: string | null;
  confidence_level_id: string | null;
  confidence_level_name: string | null;
  evidence_count: number;
}

interface ConfidenceLevel { id: string; name: string }

const EMPTY_FORM = { statement: '', subject_object_id: '', confidence_level_id: 'confidence_unknown', status: 'open' as ClaimRecord['status'], notes: '' };

const ClaimsPage: React.FC = () => {
  const navigate = useNavigate();
  const { canCreate } = usePermissions();
  const globalQuery = useSearchStore((state) => state.globalQuery);
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [confidenceLevels, setConfidenceLevels] = useState<ConfidenceLevel[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showCreate, setShowCreate] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadClaims = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (globalQuery.trim()) params.set('q', globalQuery.trim());
      const [claimsRes, confidenceRes] = await Promise.all([
        fetch(`/api/v1/claims?${params.toString()}`),
        fetch('/api/v1/claims/confidence-levels'),
      ]);
      if (!claimsRes.ok || !confidenceRes.ok) throw new Error('Failed to load claims');
      const claimsJson = await claimsRes.json() as { data: ClaimRecord[] };
      const confidenceJson = await confidenceRes.json() as { data: ConfidenceLevel[] };
      setClaims(claimsJson.data);
      setConfidenceLevels(confidenceJson.data);
      setForm((current) => current.confidence_level_id ? current : { ...current, confidence_level_id: confidenceJson.data[0]?.id ?? 'confidence_unknown' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load claims');
    } finally {
      setIsLoading(false);
    }
  }, [globalQuery]);

  useEffect(() => { void loadClaims(); }, [loadClaims]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statement: form.statement.trim(),
          subject_object_id: form.subject_object_id.trim() || null,
          confidence_level_id: form.confidence_level_id || null,
          status: form.status,
          notes: form.notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to create claim');
      const created = await res.json() as ClaimRecord;
      setForm(EMPTY_FORM);
      navigate(`/claims/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create claim');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="claims" />} context="claims">
      <div className={styles.page}>
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>Apex Family Legacy</p><h1>Claims</h1><p className={styles.subtitle}>Track historical conclusions separately from the artifacts that support, contradict, or mention them.</p></div>
          {canCreate && <Button onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Cancel' : 'New Claim'}</Button>}
        </header>

        {showCreate && <form className={styles.formCard} onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            <label className={styles.field}><span>Statement</span><Input value={form.statement} onChange={(e) => setForm({ ...form, statement: e.target.value })} required /></label>
            <label className={styles.field}><span>Subject Archive Object ID</span><Input value={form.subject_object_id} onChange={(e) => setForm({ ...form, subject_object_id: e.target.value })} placeholder="person, event, place, artifact..." /></label>
            <label className={styles.field}><span>Confidence</span><select value={form.confidence_level_id} onChange={(e) => setForm({ ...form, confidence_level_id: e.target.value })}>{confidenceLevels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}</select></label>
            <label className={styles.field}><span>Status</span><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ClaimRecord['status'] })}><option value="open">Open</option><option value="supported">Supported</option><option value="conflicted">Conflicted</option><option value="rejected">Rejected</option><option value="unknown">Unknown</option></select></label>
          </div>
          <label className={styles.field}><span>Notes</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></label>
          <div className={styles.actions}><Button type="submit" loading={isSaving}>Create Claim</Button></div>
        </form>}

        {error && <div className={styles.error}>{error}</div>}
        {isLoading ? <div className={styles.empty}>Loading claims...</div> : claims.length === 0 ? <div className={styles.empty}>No claims yet. Add a claim when you want to evaluate evidence and confidence.</div> : (
          <div className={styles.grid}>{claims.map((claim) => <Link key={claim.id} to={`/claims/${claim.id}`} className={styles.card}><div className={styles.cardType}>{claim.status}</div><h2>{claim.statement}</h2><div className={styles.meta}>{claim.subject_title && <span>{claim.subject_title}</span>}{claim.confidence_level_name && <span>{claim.confidence_level_name}</span>}<span>{claim.evidence_count} evidence link{claim.evidence_count === 1 ? '' : 's'}</span></div></Link>)}</div>
        )}
      </div>
    </AppShell>
  );
};

export default ClaimsPage;
