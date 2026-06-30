import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import PersonPicker from '@/components/entity-pickers/PersonPicker';
import type { PersonResult } from '@/components/PersonSearch/PersonSearch';
import { usePermissions } from '@/hooks/usePermissions';
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
  updated_at: string;
}

interface ArtifactType { id: string; name: string }
interface EvidenceClassification { id: string; name: string }

interface ConnectedObject {
  relationship_id: string;
  relationship_type_code: string;
  relationship_type_name: string;
  role: string;
  object_id: string;
  object_type: string;
  title: string;
  summary: string | null;
  artifact_type_name: string | null;
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

function formFromArtifact(artifact: ArtifactRecord): ArtifactForm {
  return {
    title: artifact.title,
    summary: artifact.summary ?? '',
    artifact_type_id: artifact.artifact_type_id,
    evidence_classification_id: artifact.evidence_classification_id ?? '',
    original_date_text: artifact.original_date_text ?? '',
    creator_text: artifact.creator_text ?? '',
    physical_location: artifact.physical_location ?? '',
    notes: artifact.notes ?? '',
    privacy_level: artifact.privacy_level,
  };
}

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

const DetailRow: React.FC<{ label: string; value: string | null }> = ({ label, value }) => (
  <div className={styles.detailRow}>
    <span>{label}</span>
    <strong>{value || '—'}</strong>
  </div>
);

const ArtifactDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit, canDelete } = usePermissions();
  const [artifact, setArtifact] = useState<ArtifactRecord | null>(null);
  const [artifactTypes, setArtifactTypes] = useState<ArtifactType[]>([]);
  const [evidenceClassifications, setEvidenceClassifications] = useState<EvidenceClassification[]>([]);
  const [form, setForm] = useState<ArtifactForm | null>(null);
  const [connectedPeople, setConnectedPeople] = useState<ConnectedObject[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PersonResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const loadArtifact = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [artifactRes, typesRes, evidenceRes] = await Promise.all([
        fetch(`/api/v1/artifacts/${id}`),
        fetch('/api/v1/artifacts/types'),
        fetch('/api/v1/artifacts/evidence-classifications'),
      ]);
      if (!artifactRes.ok) throw new Error('Artifact not found');
      if (!typesRes.ok || !evidenceRes.ok) throw new Error('Failed to load artifact lookups');
      const artifactJson = await artifactRes.json() as ArtifactRecord;
      const typesJson = await typesRes.json() as { data: ArtifactType[] };
      const evidenceJson = await evidenceRes.json() as { data: EvidenceClassification[] };
      setArtifact(artifactJson);
      setForm(formFromArtifact(artifactJson));
      setArtifactTypes(typesJson.data);
      setEvidenceClassifications(evidenceJson.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load artifact');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const loadConnectedPeople = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/v1/relationships/objects/${id}/connected?type=appears_in`);
    if (!res.ok) return;
    const json = await res.json() as { data: ConnectedObject[] };
    setConnectedPeople(json.data.filter((object) => object.object_type === 'person'));
  }, [id]);

  useEffect(() => {
    void loadArtifact();
  }, [loadArtifact]);

  useEffect(() => {
    void loadConnectedPeople();
  }, [loadConnectedPeople]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !form) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/v1/artifacts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanPayload(form)),
      });
      if (!res.ok) throw new Error('Failed to save artifact');
      const updated = await res.json() as ArtifactRecord;
      setArtifact(updated);
      setForm(formFromArtifact(updated));
      setEditMode(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save artifact');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !window.confirm('Delete this artifact metadata?')) return;
    const res = await fetch(`/api/v1/artifacts/${id}`, { method: 'DELETE' });
    if (res.ok) navigate('/artifacts');
  };

  const handleConnectPerson = async () => {
    if (!id || !selectedPerson) return;
    setIsConnecting(true);
    setConnectError(null);
    try {
      const res = await fetch('/api/v1/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relationship_type_code: 'appears_in',
          label: `${selectedPerson.displayName ?? selectedPerson.display_name ?? selectedPerson.given_name ?? 'Person'} appears in ${artifact?.title ?? 'artifact'}`,
          members: [
            { object_id: selectedPerson.id, role: 'subject' },
            { object_id: id, role: 'artifact' },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? 'Failed to connect person');
      }
      setSelectedPerson(null);
      await loadConnectedPeople();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Failed to connect person');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="artifacts" />} context="artifacts">
      <div className={styles.page}>
        <Link className={styles.backLink} to="/artifacts">Back to artifacts</Link>
        {isLoading ? (
          <div className={styles.empty}>Loading artifact...</div>
        ) : error || !artifact || !form ? (
          <div className={styles.error}>{error ?? 'Artifact not found'}</div>
        ) : (
          <>
            <header className={styles.header}>
              <div>
                <p className={styles.eyebrow}>{artifact.artifact_type_name}</p>
                <h1>{artifact.title}</h1>
                {artifact.summary && <p className={styles.subtitle}>{artifact.summary}</p>}
              </div>
              <div className={styles.actions}>
                {canEdit && <Button variant="ghost" onClick={() => setEditMode((value) => !value)}>{editMode ? 'Cancel' : 'Edit'}</Button>}
                {canDelete && <Button variant="danger" onClick={handleDelete}>Delete</Button>}
              </div>
            </header>

            {editMode ? (
              <form className={styles.formCard} onSubmit={handleSave}>
                <div className={styles.formGrid}>
                  <label className={styles.field}><span>Title</span><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
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
                  <label className={styles.field}><span>Original Date</span><Input value={form.original_date_text} onChange={(e) => setForm({ ...form, original_date_text: e.target.value })} /></label>
                  <label className={styles.field}><span>Creator</span><Input value={form.creator_text} onChange={(e) => setForm({ ...form, creator_text: e.target.value })} /></label>
                  <label className={styles.field}><span>Physical Location</span><Input value={form.physical_location} onChange={(e) => setForm({ ...form, physical_location: e.target.value })} /></label>
                  <label className={styles.field}><span>Summary</span><Input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></label>
                </div>
                <label className={styles.field}><span>Notes</span><textarea rows={5} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
                {saveError && <div className={styles.error}>{saveError}</div>}
                <div className={styles.actions}><Button type="submit" loading={isSaving}>Save Artifact</Button></div>
              </form>
            ) : (
              <section className={styles.detailCard}>
                <DetailRow label="Artifact Type" value={artifact.artifact_type_name} />
                <DetailRow label="Evidence Classification" value={artifact.evidence_classification_name} />
                <DetailRow label="Original Date" value={artifact.original_date_text} />
                <DetailRow label="Creator" value={artifact.creator_text} />
                <DetailRow label="Physical Location" value={artifact.physical_location} />
                <DetailRow label="Privacy" value={artifact.privacy_level} />
                <DetailRow label="Notes" value={artifact.notes} />
              </section>
            )}

            <section className={styles.detailCard}>
              <div className={styles.sectionTitleRow}>
                <h2>Connected People</h2>
                {connectedPeople.length > 0 && <span className={styles.cardType}>{connectedPeople.length}</span>}
              </div>
              {connectedPeople.length === 0 ? (
                <p className={styles.muted}>No people connected to this artifact yet.</p>
              ) : (
                <div className={styles.connectedList}>
                  {connectedPeople.map((person) => (
                    <Link key={`${person.relationship_id}-${person.object_id}`} to={`/people/${person.object_id}`} className={styles.connectedItem}>
                      <strong>{person.title}</strong>
                      <span>{person.relationship_type_name}</span>
                    </Link>
                  ))}
                </div>
              )}

              {canEdit && (
                <div className={styles.connectBox}>
                  <PersonPicker
                    label="Connect a person who appears in this artifact"
                    value={selectedPerson?.id ?? null}
                    onSelect={setSelectedPerson}
                    onClear={() => setSelectedPerson(null)}
                  />
                  {connectError && <div className={styles.error}>{connectError}</div>}
                  <Button onClick={handleConnectPerson} loading={isConnecting} disabled={!selectedPerson}>Connect Person</Button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
};

export default ArtifactDetailPage;
