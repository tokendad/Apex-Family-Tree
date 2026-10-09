import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import ActionDrawer from '@/components/archive-object/ActionDrawer';
import ArchiveObjectLayout from '@/components/archive-object/ArchiveObjectLayout';
import { type ContextActionItem } from '@/components/archive-object/ContextActionsMenu';
import { usePageActions } from '@/contexts/PageActionsContext';
import ObjectCollections, { CollectionMembership } from '@/components/ObjectCollections/ObjectCollections';
import { usePermissions } from '@/hooks/usePermissions';
import ObjectPicker from '@/components/entity-pickers/ObjectPicker';
import type { ArchiveObjectResult } from '@/components/entity-pickers/ObjectPicker';
import { objectPath } from '@/utils/objectPath';
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

interface RelationshipRole {
  role: string;
  allowed_object_types: string[];
  is_required: boolean;
}

interface RelationshipTypeOption {
  id: string;
  code: string;
  name: string;
  category: string | null;
  description: string | null;
  roles: RelationshipRole[];
}

/**
 * Works out which role this artifact takes and which role the other object
 * takes, for a given relationship type.
 *
 * Role names are per-type: depicts_event uses 'artifact' and 'event',
 * belongs_to_collection uses 'collection' and 'item'. Guessing produces a
 * validation error from the API, so the roles are derived from the type's own
 * definition. The artifact claims the first role that accepts an artifact, and
 * the other object takes a different remaining role.
 */
function resolveRoles(type: RelationshipTypeOption | undefined, targetType: string): {
  artifactRole: string;
  targetRole: string;
} | null {
  if (!type) return null;

  const artifactRole = type.roles.find((role) => role.allowed_object_types.includes('artifact'));
  const targetRole = type.roles.find(
    (role) => role.role !== artifactRole?.role && role.allowed_object_types.includes(targetType),
  );

  if (!artifactRole || !targetRole) return null;
  return { artifactRole: artifactRole.role, targetRole: targetRole.role };
}

/** Object types this relationship can attach an artifact to. */
function allowedTargetTypes(type: RelationshipTypeOption | undefined): string[] {
  if (!type) return [];
  const artifactRole = type.roles.find((role) => role.allowed_object_types.includes('artifact'));
  return type.roles
    .filter((role) => role.role !== artifactRole?.role)
    .flatMap((role) => role.allowed_object_types);
}

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
  // Collection membership lives in collection_items, not in relationships,
  // so it is loaded separately from connectedObjects (#26).
  const [memberOf, setMemberOf] = useState<CollectionMembership[]>([]);
  const [artifact, setArtifact] = useState<ArtifactRecord | null>(null);
  const [artifactTypes, setArtifactTypes] = useState<ArtifactType[]>([]);
  const [evidenceClassifications, setEvidenceClassifications] = useState<EvidenceClassification[]>([]);
  const [form, setForm] = useState<ArtifactForm | null>(null);
  const [connectedObjects, setConnectedObjects] = useState<ConnectedObject[]>([]);
  const [relationshipTypes, setRelationshipTypes] = useState<RelationshipTypeOption[]>([]);
  const [connectTarget, setConnectTarget] = useState<ArchiveObjectResult | null>(null);
  const [connectTypeCode, setConnectTypeCode] = useState('');
  // Removal is two-step rather than immediate: a relationship carries
  // provenance, and the API hard-deletes it with no undo.
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [relatedClaims, setRelatedClaims] = useState<RelatedClaim[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [drawerMode, setDrawerMode] = useState<'connect' | 'add-claim' | 'add-transcript' | 'record-provenance' | null>(null);
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

  const loadConnectedObjects = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/v1/relationships/objects/${id}/connected`);
    if (!res.ok) return;
    const json = await res.json() as { data: ConnectedObject[] };
    // Everything connected, not just people — an artifact belongs to events,
    // places, stories and collections as much as to the people in it.
    setConnectedObjects(json.data);
  }, [id]);

  const loadRelationshipTypes = useCallback(async () => {
    const res = await fetch('/api/v1/relationships/types');
    if (!res.ok) return;
    const json = await res.json() as { data: RelationshipTypeOption[] };
    setRelationshipTypes(json.data);
  }, []);

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
    void loadConnectedObjects();
    void loadRelationshipTypes();
  }, [loadConnectedObjects, loadRelationshipTypes]);

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

  const selectedConnectType = relationshipTypes.find((type) => type.code === connectTypeCode);

  const handleConnect = async () => {
    if (!id || !connectTarget || !connectTypeCode) return;
    setIsConnecting(true);
    setConnectError(null);
    try {
      const type = relationshipTypes.find((option) => option.code === connectTypeCode);
      const roles = resolveRoles(type, connectTarget.object_type);
      if (!roles) {
        throw new Error(
          `A ${connectTarget.object_type} cannot be connected with "${type?.name ?? connectTypeCode}".`,
        );
      }
      const typeName = type?.name ?? connectTypeCode;
      const res = await fetch('/api/v1/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relationship_type_code: connectTypeCode,
          label: `${artifact?.title ?? 'Artifact'} — ${typeName} — ${connectTarget.title}`,
          members: [
            { object_id: id, role: roles.artifactRole },
            { object_id: connectTarget.id, role: roles.targetRole },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? 'Failed to connect');
      }

      setConnectTarget(null);
      setConnectTypeCode('');
      setDrawerMode(null);
      await loadConnectedObjects();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRemoveConnection = async (relationshipId: string) => {
    setRemoveError(null);
    try {
      const res = await fetch(`/api/v1/relationships/${relationshipId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove connection');
      setPendingRemoval(null);
      await loadConnectedObjects();
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Failed to remove connection');
    }
  };


  const drawerTitle = drawerMode === 'connect'
    ? 'Connect Person'
    : drawerMode === 'add-claim'
      ? 'Add Claim'
      : drawerMode === 'add-transcript'
        ? 'Add Transcript'
        : 'Record Provenance';

  const contextActions: ContextActionItem[] = [
    {
      id: 'connect',
      label: 'Connect',
      description: 'Link this artifact to a person, event, place, story or collection',
      disabled: !canEdit,
      onSelect: () => setDrawerMode('connect'),
    },
    {
      id: 'edit-artifact',
      label: 'Edit Artifact',
      description: 'Update metadata, privacy, and notes',
      group: 'manage',
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
      group: 'manage',
      danger: true,
      disabled: !canDelete,
      onSelect: handleDelete,
    },
  ];

  usePageActions(artifact ? `Actions for ${artifact.title}` : '', artifact ? contextActions : []);

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="artifacts" />} context="artifacts">
      <div className={styles.detailPage}>
        <div className={styles.detailPageInner}>
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
              stats={[
                { label: 'Connections', value: connectedObjects.length },
                { label: 'Claims', value: relatedClaims.length },
                { label: 'Type', value: artifact.artifact_type_name },
              ]}
              tabs={[
                { id: 'details', label: 'Details' },
                { id: 'connections', label: 'Connections', count: connectedObjects.length },
                { id: 'collections', label: 'Collections', count: memberOf.length },
                { id: 'claims', label: 'Claims', count: relatedClaims.length },
              ]}
              activeTab={activeTab}
              onTabChange={(tabId) => {
                setActiveTab(tabId);
                if (tabId !== 'details') setEditMode(false);
              }}
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

              {activeTab === 'connections' && (
                <section className={styles.detailCard}>
                  <div className={styles.sectionTitleRow}>
                    <h2>Connections</h2>
                    {connectedObjects.length > 0 && <span className={styles.cardType}>{connectedObjects.length}</span>}
                  </div>

                  {removeError && <div className={styles.error}>{removeError}</div>}

                  {connectedObjects.length === 0 ? (
                    <p className={styles.muted}>
                      Nothing connected yet. Use Actions &rarr; Connect to link this artifact to the
                      people in it, the event it depicts, or a collection it belongs to.
                    </p>
                  ) : (
                    <div className={styles.connectedList}>
                      {connectedObjects.map((object) => (
                        <div key={object.relationship_id} className={styles.connectedItem}>
                          <Link to={objectPath(object.object_type, object.object_id)}>
                            <strong>{object.title}</strong>
                          </Link>
                          <span>
                            {object.relationship_type_name} &middot; {object.object_type}
                          </span>

                          {canEdit && (
                            pendingRemoval === object.relationship_id ? (
                              <span className={styles.confirmRow}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void handleRemoveConnection(object.relationship_id)}
                                >
                                  Confirm removal
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setPendingRemoval(null)}>
                                  Cancel
                                </Button>
                              </span>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPendingRemoval(object.relationship_id)}
                              >
                                Remove
                              </Button>
                            )
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {activeTab === 'collections' && (
                <section className={styles.detailCard}>
                  <div className={styles.sectionTitleRow}>
                    <h2>Collections</h2>
                    {memberOf.length > 0 && <span className={styles.cardType}>{memberOf.length}</span>}
                  </div>
                  <ObjectCollections
                    objectId={artifact.id}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    onChange={setMemberOf}
                  />
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
      </div>
      <ActionDrawer
        open={drawerMode !== null}
        title={drawerTitle}
        description={drawerMode === 'connect' ? 'Link this artifact to another object in the archive.' : 'This action is part of the shared artifact command surface.'}
        onClose={() => setDrawerMode(null)}
      >
        {drawerMode === 'connect' ? (
          <div className={styles.connectBox}>
            {/* Relationship first: it determines which kinds of object are
                valid, so choosing it narrows the search rather than letting the
                user pick something the relationship cannot accept. */}
            <label className={styles.connectLabel} htmlFor="connect-type">
              How are they related?
            </label>
            <select
              id="connect-type"
              value={connectTypeCode}
              onChange={(event) => {
                setConnectTypeCode(event.target.value);
                setConnectTarget(null);
              }}
            >
              <option value="">Choose a relationship…</option>
              {relationshipTypes.map((type) => (
                <option key={type.id} value={type.code}>
                  {type.name}
                </option>
              ))}
            </select>
            {selectedConnectType?.description && (
              <p className={styles.muted}>{selectedConnectType.description}</p>
            )}

            {connectTypeCode && (
              <ObjectPicker
                label="What should this artifact be connected to?"
                objectTypes={allowedTargetTypes(selectedConnectType)}
                value={connectTarget}
                excludeIds={connectedObjects.map((object) => object.object_id)}
                onSelect={setConnectTarget}
                onClear={() => setConnectTarget(null)}
              />
            )}

            {connectError && <div className={styles.error}>{connectError}</div>}
            <Button
              onClick={handleConnect}
              loading={isConnecting}
              disabled={!connectTarget || !connectTypeCode}
            >
              Connect
            </Button>
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
