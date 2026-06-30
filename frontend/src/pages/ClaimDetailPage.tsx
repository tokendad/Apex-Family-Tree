import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import { usePermissions } from '@/hooks/usePermissions';
import styles from './ArtifactsPage.module.css';

interface ConfidenceLevel { id: string; name: string }
interface ClaimSubject { id: string; subject_object_id: string; object_type: string; title: string; role: string }
interface ClaimEvidence { id: string; evidence_object_id: string; evidence_role: string; title: string; evidence_classification_name: string | null; weight_score: number | null; notes: string | null }
interface ClaimRecord {
  id: string;
  statement: string;
  title: string;
  summary: string | null;
  privacy_level: 'public' | 'family' | 'private' | 'restricted';
  subject_object_id: string | null;
  date_text: string | null;
  confidence_level_id: string | null;
  confidence_level_name: string | null;
  confidence_score: number | null;
  status: 'open' | 'supported' | 'conflicted' | 'rejected' | 'unknown';
  notes: string | null;
  subjects: ClaimSubject[];
  evidence: ClaimEvidence[];
}

function objectPath(type: string, id: string): string {
  if (type === 'person') return `/people/${id}`;
  if (type === 'artifact') return `/artifacts/${id}`;
  if (type === 'event') return `/events/${id}`;
  if (type === 'place') return `/places/${id}`;
  if (type === 'collection') return `/collections/${id}`;
  if (type === 'claim') return `/claims/${id}`;
  return '#';
}

function formFromClaim(claim: ClaimRecord) {
  return {
    statement: claim.statement,
    subject_object_id: claim.subject_object_id ?? '',
    date_text: claim.date_text ?? '',
    confidence_level_id: claim.confidence_level_id ?? 'confidence_unknown',
    confidence_score: claim.confidence_score?.toString() ?? '',
    status: claim.status,
    notes: claim.notes ?? '',
    privacy_level: claim.privacy_level,
  };
}

const ClaimDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit, canDelete } = usePermissions();
  const [claim, setClaim] = useState<ClaimRecord | null>(null);
  const [confidenceLevels, setConfidenceLevels] = useState<ConfidenceLevel[]>([]);
  const [form, setForm] = useState<ReturnType<typeof formFromClaim> | null>(null);
  const [artifactId, setArtifactId] = useState('');
  const [evidenceRole, setEvidenceRole] = useState('supports');
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadClaim = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [claimRes, confidenceRes] = await Promise.all([
        fetch(`/api/v1/claims/${id}`),
        fetch('/api/v1/claims/confidence-levels'),
      ]);
      if (!claimRes.ok) throw new Error('Claim not found');
      if (!confidenceRes.ok) throw new Error('Failed to load confidence levels');
      const claimJson = await claimRes.json() as ClaimRecord;
      const confidenceJson = await confidenceRes.json() as { data: ConfidenceLevel[] };
      setClaim(claimJson);
      setForm(formFromClaim(claimJson));
      setConfidenceLevels(confidenceJson.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load claim');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { void loadClaim(); }, [loadClaim]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !form) return;
    const res = await fetch(`/api/v1/claims/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statement: form.statement.trim(),
        subject_object_id: form.subject_object_id.trim() || null,
        date_text: form.date_text.trim() || null,
        confidence_level_id: form.confidence_level_id || null,
        confidence_score: form.confidence_score.trim() ? Number(form.confidence_score) : null,
        status: form.status,
        notes: form.notes.trim() || null,
        privacy_level: form.privacy_level,
      }),
    });
    if (res.ok) {
      setEditMode(false);
      await loadClaim();
    }
  };

  const handleDelete = async () => {
    if (!id || !window.confirm('Delete this claim?')) return;
    const res = await fetch(`/api/v1/claims/${id}`, { method: 'DELETE' });
    if (res.ok) navigate('/claims');
  };

  const handleAddEvidence = async () => {
    if (!id || !artifactId.trim()) return;
    const res = await fetch(`/api/v1/claims/${id}/evidence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidence_object_id: artifactId.trim(), evidence_role: evidenceRole, notes: evidenceNotes.trim() || null }),
    });
    if (res.ok) {
      setArtifactId('');
      setEvidenceNotes('');
      await loadClaim();
    }
  };

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="claims" />} context="claims">
      <div className={styles.page}>
        <Link className={styles.backLink} to="/claims">Back to claims</Link>
        {isLoading ? <div className={styles.empty}>Loading claim...</div> : error || !claim || !form ? <div className={styles.error}>{error ?? 'Claim not found'}</div> : <>
          <header className={styles.header}><div><p className={styles.eyebrow}>{claim.status}</p><h1>{claim.statement}</h1>{claim.confidence_level_name && <p className={styles.subtitle}>Confidence: {claim.confidence_level_name}</p>}</div><div className={styles.actions}>{canEdit && <Button variant="ghost" onClick={() => setEditMode((value) => !value)}>{editMode ? 'Cancel' : 'Edit'}</Button>}{canDelete && <Button variant="danger" onClick={handleDelete}>Delete</Button>}</div></header>

          {editMode ? <form className={styles.formCard} onSubmit={handleSave}>
            <div className={styles.formGrid}>
              <label className={styles.field}><span>Statement</span><Input value={form.statement} onChange={(e) => setForm({ ...form, statement: e.target.value })} required /></label>
              <label className={styles.field}><span>Subject Object ID</span><Input value={form.subject_object_id} onChange={(e) => setForm({ ...form, subject_object_id: e.target.value })} /></label>
              <label className={styles.field}><span>Date</span><Input value={form.date_text} onChange={(e) => setForm({ ...form, date_text: e.target.value })} /></label>
              <label className={styles.field}><span>Confidence</span><select value={form.confidence_level_id} onChange={(e) => setForm({ ...form, confidence_level_id: e.target.value })}>{confidenceLevels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}</select></label>
              <label className={styles.field}><span>Confidence Score</span><Input type="number" min="0" max="100" value={form.confidence_score} onChange={(e) => setForm({ ...form, confidence_score: e.target.value })} /></label>
              <label className={styles.field}><span>Status</span><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ClaimRecord['status'] })}><option value="open">Open</option><option value="supported">Supported</option><option value="conflicted">Conflicted</option><option value="rejected">Rejected</option><option value="unknown">Unknown</option></select></label>
            </div>
            <label className={styles.field}><span>Notes</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} /></label>
            <div className={styles.actions}><Button type="submit">Save Claim</Button></div>
          </form> : <section className={styles.detailCard}><div className={styles.detailRow}><span>Subject</span><strong>{claim.subjects.map(subject => subject.title).join(', ') || '-'}</strong></div><div className={styles.detailRow}><span>Date</span><strong>{claim.date_text || '-'}</strong></div><div className={styles.detailRow}><span>Confidence</span><strong>{claim.confidence_level_name || '-'}</strong></div><div className={styles.detailRow}><span>Confidence Score</span><strong>{claim.confidence_score?.toString() || '-'}</strong></div><div className={styles.detailRow}><span>Notes</span><strong>{claim.notes || '-'}</strong></div></section>}

          <section className={styles.detailCard}>
            <div className={styles.sectionTitleRow}><h2>Subjects</h2></div>
            {claim.subjects.length === 0 ? <p className={styles.muted}>No subject connected.</p> : <div className={styles.connectedList}>{claim.subjects.map((subject) => <Link key={subject.id} className={styles.connectedItem} to={objectPath(subject.object_type, subject.subject_object_id)}><strong>{subject.title}</strong><span>{subject.role}</span></Link>)}</div>}
          </section>

          <section className={styles.detailCard}>
            <div className={styles.sectionTitleRow}><h2>Evidence</h2></div>
            {claim.evidence.length === 0 ? <p className={styles.muted}>No artifact evidence connected yet.</p> : <div className={styles.connectedList}>{claim.evidence.map((evidence) => <Link key={evidence.id} className={styles.connectedItem} to={`/artifacts/${evidence.evidence_object_id}`}><strong>{evidence.title}</strong><span>{evidence.evidence_role}{evidence.weight_score !== null ? `, weight ${evidence.weight_score}` : ''}</span></Link>)}</div>}
            {canEdit && <div className={styles.connectBox}><Input placeholder="Artifact archive object ID" value={artifactId} onChange={(event) => setArtifactId(event.target.value)} /><select value={evidenceRole} onChange={(event) => setEvidenceRole(event.target.value)}><option value="supports">Supports</option><option value="contradicts">Contradicts</option><option value="mentions">Mentions</option><option value="uncertain">Uncertain</option></select><Input placeholder="Evidence notes" value={evidenceNotes} onChange={(event) => setEvidenceNotes(event.target.value)} /><Button onClick={handleAddEvidence}>Add Evidence</Button></div>}
          </section>
        </>}
      </div>
    </AppShell>
  );
};

export default ClaimDetailPage;
