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

interface ArtifactRecord {
  id: string;
  title: string;
  summary: string | null;
  privacy_level: 'public' | 'family' | 'private' | 'restricted';
  artifact_type_id: string;
  artifact_type_name: string;
  evidence_classification_id: string | null;
  evidence_classification_name: string | null;
  original_date_text: string | null;
  creator_text: string | null;
  physical_location: string | null;
  notes: string | null;
  created_at: string;
}

interface ArtifactType {
  id: string;
  name: string;
}

interface EvidenceClassification {
  id: string;
  name: string;
}

interface ArtifactForm {
  title: string;
  summary: string;
  artifact_type_id: string;
  evidence_classification_id: string;
  original_date_text: string;
  creator_text: string;
  physical_location: string;
  notes: string;
  privacy_level: ArtifactRecord['privacy_level'];
}

const EMPTY_FORM: ArtifactForm = {
  title: '',
  summary: '',
  artifact_type_id: '',
  evidence_classification_id: '',
  original_date_text: '',
  creator_text: '',
  physical_location: '',
  notes: '',
  privacy_level: 'family',
};

function cleanPayload(form: ArtifactForm) {
  return {
    title: form.title.trim(),
    summary: form.summary.trim() || null,
    artifact_type_id: form.artifact_type_id,
    evidence_classification_id: form.evidence_classification_id || null,
    original_date_text: form.original_date_text.trim() || null,
    creator_text: form.creator_text.trim() || null,
    physical_location: form.physical_location.trim() || null,
    notes: form.notes.trim() || null,
    privacy_level: form.privacy_level,
  };
}

const ArtifactsPage: React.FC = () => {
  const navigate = useNavigate();
  const { canCreate } = usePermissions();
  const globalQuery = useSearchStore((state) => state.globalQuery);
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);
  const [artifactTypes, setArtifactTypes] = useState<ArtifactType[]>([]);
  const [evidenceClassifications, setEvidenceClassifications] = useState<EvidenceClassification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<ArtifactForm>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadLookups = useCallback(async () => {
    const [typesRes, evidenceRes] = await Promise.all([
      fetch('/api/v1/artifacts/types'),
      fetch('/api/v1/artifacts/evidence-classifications'),
    ]);
    if (!typesRes.ok || !evidenceRes.ok) throw new Error('Failed to load artifact lookups');
    const typesJson = await typesRes.json() as { data: ArtifactType[] };
    const evidenceJson = await evidenceRes.json() as { data: EvidenceClassification[] };
    setArtifactTypes(typesJson.data);
    setEvidenceClassifications(evidenceJson.data);
    setForm((current) => current.artifact_type_id ? current : { ...current, artifact_type_id: typesJson.data[0]?.id ?? '' });
  }, []);

  const loadArtifacts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (globalQuery.trim()) params.set('q', globalQuery.trim());
      const res = await fetch(`/api/v1/artifacts?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load artifacts');
      const json = await res.json() as { data: ArtifactRecord[] };
      setArtifacts(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load artifacts');
    } finally {
      setIsLoading(false);
    }
  }, [globalQuery]);

  useEffect(() => {
    void loadLookups().catch(() => setError('Failed to load artifact lookups'));
  }, [loadLookups]);

  useEffect(() => {
    void loadArtifacts();
  }, [loadArtifacts]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/v1/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanPayload(form)),
      });
      if (!res.ok) throw new Error('Failed to create artifact');
      const created = await res.json() as ArtifactRecord;
      setForm({ ...EMPTY_FORM, artifact_type_id: artifactTypes[0]?.id ?? '' });
      setShowCreate(false);
      navigate(`/artifacts/${created.id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to create artifact');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="artifacts" />} context="artifacts">
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Apex Family Legacy</p>
            <h1>Artifacts</h1>
            <p className={styles.subtitle}>Catalog preserved family items before attaching files, people, events, and stories.</p>
          </div>
          {canCreate && (
            <Button onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Cancel' : 'New Artifact'}</Button>
          )}
        </header>

        {showCreate && (
          <form className={styles.formCard} onSubmit={handleSubmit}>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Title</span>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </label>
              <label className={styles.field}>
                <span>Artifact Type</span>
                <select value={form.artifact_type_id} onChange={(e) => setForm({ ...form, artifact_type_id: e.target.value })} required>
                  {artifactTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span>Evidence Classification</span>
                <select value={form.evidence_classification_id} onChange={(e) => setForm({ ...form, evidence_classification_id: e.target.value })}>
                  <option value="">None yet</option>
                  {evidenceClassifications.map((classification) => <option key={classification.id} value={classification.id}>{classification.name}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span>Privacy</span>
                <select value={form.privacy_level} onChange={(e) => setForm({ ...form, privacy_level: e.target.value as ArtifactForm['privacy_level'] })}>
                  <option value="family">Family</option>
                  <option value="private">Private</option>
                  <option value="restricted">Restricted</option>
                  <option value="public">Public</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Original Date</span>
                <Input value={form.original_date_text} onChange={(e) => setForm({ ...form, original_date_text: e.target.value })} placeholder="ABT 1954" />
              </label>
              <label className={styles.field}>
                <span>Creator</span>
                <Input value={form.creator_text} onChange={(e) => setForm({ ...form, creator_text: e.target.value })} />
              </label>
              <label className={styles.field}>
                <span>Physical Location</span>
                <Input value={form.physical_location} onChange={(e) => setForm({ ...form, physical_location: e.target.value })} />
              </label>
              <label className={styles.field}>
                <span>Summary</span>
                <Input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
              </label>
            </div>
            <label className={styles.field}>
              <span>Notes</span>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} />
            </label>
            {saveError && <div className={styles.error}>{saveError}</div>}
            <div className={styles.actions}><Button type="submit" loading={isSaving}>Create Artifact</Button></div>
          </form>
        )}

        {error && <div className={styles.error}>{error}</div>}
        {isLoading ? (
          <div className={styles.empty}>Loading artifacts...</div>
        ) : artifacts.length === 0 ? (
          <div className={styles.empty}>No artifacts yet. Add a photograph, letter, recipe, document, or keepsake to begin the archive.</div>
        ) : (
          <div className={styles.grid}>
            {artifacts.map((artifact) => (
              <Link key={artifact.id} to={`/artifacts/${artifact.id}`} className={styles.card}>
                <div className={styles.cardType}>{artifact.artifact_type_name}</div>
                <h2>{artifact.title}</h2>
                {artifact.summary && <p>{artifact.summary}</p>}
                <div className={styles.meta}>
                  {artifact.original_date_text && <span>{artifact.original_date_text}</span>}
                  {artifact.creator_text && <span>{artifact.creator_text}</span>}
                  {artifact.evidence_classification_name && <span>{artifact.evidence_classification_name}</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default ArtifactsPage;
