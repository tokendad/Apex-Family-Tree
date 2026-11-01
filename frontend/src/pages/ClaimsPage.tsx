import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import { usePermissions } from '@/hooks/usePermissions';
import ObjectPicker, { type ArchiveObjectResult } from '@/components/entity-pickers/ObjectPicker';
import ConfidencePill from '@/components/ConfidencePill/ConfidencePill';
import { useSearchStore } from '@/stores/searchStore';
import styles from './ArtifactsPage.module.css';

interface ClaimRecord {
  id: string;
  title: string;
  statement: string;
  claim_type: string | null;
  status: 'open' | 'supported' | 'conflicted' | 'rejected' | 'unknown';
  subject_title: string | null;
  confidence_level_id: string | null;
  confidence_level_name: string | null;
  confidence_score: number | null;
  evidence_count: number;
}

interface ConfidenceLevel { id: string; name: string; numeric_value: number | null }

/* Spelled out rather than shown raw: "conflicted" is a state of the records,
   and the list should say so in words a reader recognises. */
const STATUS_LABELS: Record<ClaimRecord['status'], string> = {
  open: 'Open',
  supported: 'Supported',
  conflicted: 'Records conflict',
  rejected: 'Rejected',
  unknown: 'Unknown',
};

const EMPTY_FORM = { statement: '', subject_object_id: '', confidence_level_id: 'confidence_unknown', status: 'open' as ClaimRecord['status'], notes: '' };

const ClaimsPage: React.FC = () => {
  const navigate = useNavigate();
  const { canCreate } = usePermissions();
  const globalQuery = useSearchStore((state) => state.globalQuery);
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [confidenceLevels, setConfidenceLevels] = useState<ConfidenceLevel[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  /* The subject used to be a raw archive-object id typed into a text box. A
     claim can be about a person, an event, a place or an artifact, so the
     picker searches everything rather than restricting to people. */
  const [subject, setSubject] = useState<ArchiveObjectResult | null>(null);
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
          subject_object_id: subject?.id ?? null,
          confidence_level_id: form.confidence_level_id || null,
          status: form.status,
          notes: form.notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to create claim');
      const created = await res.json() as ClaimRecord;
      setForm(EMPTY_FORM);
      setSubject(null);
      navigate(`/claims/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create claim');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppShell navbar={<Navbar />} context="claims">
      <div className={styles.page}>
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>Apex Family Legacy</p><h1>Claims</h1><p className={styles.subtitle}>Track historical conclusions separately from the artifacts that support, contradict, or mention them.</p></div>
          {canCreate && <Button onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Cancel' : 'New Claim'}</Button>}
        </header>

        {showCreate && <form className={styles.formCard} onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            <label className={styles.field}><span>Statement</span><Input value={form.statement} onChange={(e) => setForm({ ...form, statement: e.target.value })} required /></label>
            <div className={styles.field}><ObjectPicker label="Subject" value={subject} onSelect={setSubject} onClear={() => setSubject(null)} /></div>
            <label className={styles.field}><span>Confidence</span><select value={form.confidence_level_id} onChange={(e) => setForm({ ...form, confidence_level_id: e.target.value })}>{confidenceLevels.map((level) => <option key={level.id} value={level.id}>{level.numeric_value === null ? level.name : `${level.name} · ${level.numeric_value}`}</option>)}</select></label>
            <label className={styles.field}><span>Status</span><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ClaimRecord['status'] })}><option value="open">Open</option><option value="supported">Supported</option><option value="conflicted">Conflicted</option><option value="rejected">Rejected</option><option value="unknown">Unknown</option></select></label>
          </div>
          <label className={styles.field}><span>Notes</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></label>
          <div className={styles.actions}><Button type="submit" loading={isSaving}>Create Claim</Button></div>
        </form>}

        {error && <div className={styles.error}>{error}</div>}
        {isLoading ? <div className={styles.empty}>Loading claims...</div> : claims.length === 0 ? <div className={styles.empty}>No claims yet. Add a claim when you want to evaluate evidence and confidence.</div> : (
          <div className={styles.grid}>{claims.map((claim) => <Link key={claim.id} to={`/claims/${claim.id}`} className={styles.card}>
            <div className={styles.cardType}>{claim.claim_type ?? 'claim'}</div>
            <h2>{claim.statement}</h2>
            <div className={styles.meta}>
              {/* The pill carries the level and its number, so this list reads
                  the same way as a claim does on a person's page. */}
              <ConfidencePill name={claim.confidence_level_name} score={claim.confidence_score} />
              <span>{STATUS_LABELS[claim.status]}</span>
              {claim.subject_title && <span>{claim.subject_title}</span>}
              <span>{claim.evidence_count} record{claim.evidence_count === 1 ? '' : 's'}</span>
            </div>
          </Link>)}</div>
        )}
      </div>
    </AppShell>
  );
};

export default ClaimsPage;
