import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import PersonPicker from '@/components/entity-pickers/PersonPicker';
import ActionDrawer from '@/components/archive-object/ActionDrawer';
import ArchiveObjectLayout, { type ConnectedGroup } from '@/components/archive-object/ArchiveObjectLayout';
import ContextActionsMenu, { type ContextActionItem } from '@/components/archive-object/ContextActionsMenu';
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

interface RelatedClaim {
  id: string;
  statement: string;
  status: string;
  confidence_level_name: string | null;
  evidence_count: number;
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
  const [relatedClaims, setRelatedClaims] = useState<RelatedClaim[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PersonResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [drawerMode, setDrawerMode] = useState<'connect-person' | 'add-claim' | 'add-transcript' | 'record-provenance' | null>(null);
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
    const res = await fetch(`/api/v1/relationships/objects/${id}/connected`);
    if (!res.ok) return;
    const json = await res.json() as { data: ConnectedObject[] };
    setConnectedPeople(json.data.filter((object) => object.object_type === 'person'));
  }, [id]);

  const loadRelatedClaims = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/v1/claims/evidence/${id}`);
    if (!res.ok) return;
    const json = await res.json() as { data: RelatedClaim[] };
    setRelatedClaims(json.data);
  }, [id]);

  useEffect(() => {
    void loadArtifact();
  }, [loadArtifact]);

  useEffect(() => {
    void loadConnectedPeople();
  }, [loadConnectedPeople]);

  useEffect(() => {
    void loadRelatedClaims();
  }, [loadRelatedClaims]);

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
      setDrawerMode(null);
      await loadConnectedPeople();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Failed to connect person');
    } finally {
      setIsConnecting(false);
    }
  };

  const drawerTitle = drawerMode === 'connect-person'
    ? 'Connect Person'
    : drawerMode === 'add-claim'
      ? 'Add Claim'
      : drawerMode === 'add-transcript'
        ? 'Add Transcript'
        : 'Record Provenance';

  const connectedGroups: ConnectedGroup[] = [
    {
      id: 'people',
      label: 'People',
      items: connectedPeople.slice(0, 8).map((person) => ({
        id: person.object_id,
        title: person.title,
        subtitle: person.relationship_type_name,
        href: `/people/${person.object_id}`,
        initials: person.title.slice(0, 2),
      })),
    },
    {
      id: 'claims',
      label: 'Claims',
      items: relatedClaims.slice(0, 8).map((claim) => ({
        id: claim.id,
        title: claim.statement,
        subtitle: claim.confidence_level_name ?? claim.status,
        href: `/claims/${claim.id}`,
        initials: 'C',
      })),
    },
  ];

  const contextActions: ContextActionItem[] = [
    {
      id: 'connect-person',
      label: 'Connect Person',
      description: 'Link a person to this artifact',
      disabled: !canEdit,
      onSelect: () => setDrawerMode('connect-person'),
    },
    {
      id: 'edit-artifact',
      label: 'Edit Artifact',
      description: 'Update metadata, privacy, and notes',
      disabled: !canEdit,
      onSelect: () => {
        setEditMode(true);
        setActiveTab('details');
      },
    },
    {
      id: 'add-claim',
      label: 'Add Claim',
      description: 'Use this artifact as evidence',
      disabled: !canEdit,
      onSelect: () => setDrawerMode('add-claim'),
    },
    {
      id: 'add-transcript',
      label: 'Add Transcript',
      description: 'Capture artifact text',
      disabled: !canEdit,
      onSelect: () => setDrawerMode('add-transcript'),
    },
    {
      id: 'record-provenance',
      label: 'Record Provenance',
      description: 'Track ownership, donation, or scanning history',
      disabled: !canEdit,
      onSelect: () => setDrawerMode('record-provenance'),
    },
    {
      id: 'delete-artifact',
      label: 'Delete Artifact',
      description: 'Remove this artifact metadata',
      danger: true,
      disabled: !canDelete,
      onSelect: handleDelete,
    },
  ];

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
            <ArchiveObjectLayout
              eyebrow={artifact.artifact_type_name}
              title={artifact.title}
              subtitle={`${artifact.privacy_level} artifact${artifact.original_date_text ? ` • ${artifact.original_date_text}` : ''}`}
              summary={artifact.summary}
              avatar={<span>{artifact.artifact_type_name.slice(0, 2).toUpperCase()}</span>}
              headerAction={<ContextActionsMenu actions={contextActions} />}
              stats={[
                { label: 'People', value: connectedPeople.length },
                { label: 'Claims', value: relatedClaims.length },
                { label: 'Type', value: artifact.artifact_type_name },
              ]}
              tabs={[
                { id: 'details', label: 'Details' },
                { id: 'people', label: 'People', count: connectedPeople.length },
                { id: 'claims', label: 'Claims', count: relatedClaims.length },
              ]}
              activeTab={activeTab}
              onTabChange={(tabId) => {
                setActiveTab(tabId);
                if (tabId !== 'details') setEditMode(false);
              }}
              connectedGroups={connectedGroups}
            >
              {activeTab === 'details' && (editMode ? (
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
                  <div className={styles.actions}>
                    <Button type="submit" loading={isSaving}>Save Artifact</Button>
                    <Button type="button" variant="ghost" onClick={() => setEditMode(false)} disabled={isSaving}>Cancel</Button>
                  </div>
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
              ))}

              {activeTab === 'people' && (
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
                </section>
              )}

              {activeTab === 'claims' && (
                <section className={styles.detailCard}>
                  <div className={styles.sectionTitleRow}>
                    <h2>Related Claims</h2>
                    {relatedClaims.length > 0 && <span className={styles.cardType}>{relatedClaims.length}</span>}
                  </div>
                  {relatedClaims.length === 0 ? (
                    <p className={styles.muted}>No claims use this artifact as evidence yet.</p>
                  ) : (
                    <div className={styles.connectedList}>
                      {relatedClaims.map((claim) => (
                        <Link key={claim.id} to={`/claims/${claim.id}`} className={styles.connectedItem}>
                          <strong>{claim.statement}</strong>
                          <span>{claim.status}{claim.confidence_level_name ? `, ${claim.confidence_level_name}` : ''}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </ArchiveObjectLayout>
          </>
        )}
      </div>
      <ActionDrawer
        open={drawerMode !== null}
        title={drawerTitle}
        description={drawerMode === 'connect-person' ? 'Link this artifact to a person through the relationship engine.' : 'This action is part of the shared artifact command surface.'}
        onClose={() => setDrawerMode(null)}
      >
        {drawerMode === 'connect-person' ? (
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
        ) : (
          <div className={styles.connectBox}>
            <p className={styles.muted}>
              {drawerMode === 'add-claim'
                ? 'Claim creation from an artifact will open the claims workflow with this artifact preselected as evidence.'
                : drawerMode === 'add-transcript'
                  ? 'Transcript editing will attach searchable artifact text to this record.'
                  : 'Provenance recording will capture creator, owner, donor, scanner, and identifier relationships.'}
            </p>
            <Button onClick={() => {
              if (drawerMode === 'add-claim') navigate('/claims');
              setDrawerMode(null);
            }}>
              {drawerMode === 'add-claim' ? 'Open Claims' : 'Done'}
            </Button>
          </div>
        )}
      </ActionDrawer>
    </AppShell>
  );
};

export default ArtifactDetailPage;
