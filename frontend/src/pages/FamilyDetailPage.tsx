import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import { usePermissions } from '@/hooks/usePermissions';
import PersonPicker from '@/components/entity-pickers/PersonPicker';
import type { PersonResult } from '@/components/PersonSearch/PersonSearch';
import styles from './FamilyDetailPage.module.css';

interface PersonSummary {
  id: string;
  given_name: string | null;
  surname: string | null;
}

interface ChildMember {
  id: string;
  person_id: string;
  role: 'child' | 'adopted' | 'foster' | 'step';
  given_name: string | null;
  surname: string | null;
}

interface FamilyDetail {
  id: string;
  spouse1_id: string | null;
  spouse2_id: string | null;
  marriage_date: string | null;
  marriage_place: string | null;
  divorce_date: string | null;
  divorce_place: string | null;
  spouse1: PersonSummary | null;
  spouse2: PersonSummary | null;
  children: ChildMember[];
}

interface EditForm {
  marriage_date: string;
  marriage_place: string;
  divorce_date: string;
  divorce_place: string;
}

type PersonLike = { given_name: string | null; surname: string | null };

const ROLE_LABELS: Record<ChildMember['role'], string> = {
  child: 'Biological',
  adopted: 'Adopted',
  foster: 'Foster',
  step: 'Step',
};

const ROLE_CSS: Record<ChildMember['role'], string> = {
  child: styles.roleChild,
  adopted: styles.roleAdopted,
  foster: styles.roleFoster,
  step: styles.roleStep,
};

function personName(p: PersonLike | null): string {
  if (!p) return 'Unknown';
  const parts = [p.given_name, p.surname].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unknown';
}

function familyHeading(family: FamilyDetail): string {
  return `${personName(family.spouse1)} & ${personName(family.spouse2)}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SpouseCardProps {
  person: PersonSummary | null;
  label: string;
  canEdit?: boolean;
  onAssign?: (personId: string) => Promise<void>;
}

const SpouseCard: React.FC<SpouseCardProps> = ({ person, label, canEdit, onAssign }) => {
  if (!person) {
    if (canEdit && onAssign) {
      return (
        <div className={`${styles.spouseCard} ${styles.spouseCardEmpty}`}>
          <PersonPicker
            label={label}
            onSelect={(p: PersonResult) => void onAssign(p.id)}
          />
        </div>
      );
    }
    return (
      <div className={`${styles.spouseCard} ${styles.spouseCardEmpty}`}>
        <span className={styles.spouseLabel}>{label}</span>
        <span className={styles.noSpouse}>Not recorded</span>
      </div>
    );
  }
  return (
    <Link to={`/people/${person.id}`} className={`${styles.spouseCard} ${styles.spouseCardLink}`}>
      <span className={styles.spouseLabel}>{label}</span>
      <span className={styles.spouseName}>{personName(person)}</span>
      <span className={styles.spouseArrow} aria-hidden="true">→</span>
    </Link>
  );
};

interface InfoRowProps {
  label: string;
  value: string | null;
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value }) => (
  <div className={styles.infoRow}>
    <span className={styles.infoLabel}>{label}</span>
    <span className={value ? styles.infoValue : styles.infoValueEmpty}>{value ?? '—'}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const FamilyDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canEdit, canDelete } = usePermissions();

  const [family, setFamily] = useState<FamilyDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    marriage_date: '',
    marriage_place: '',
    divorce_date: '',
    divorce_place: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchFamily = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await fetch(`/api/v1/families/${id}`, { credentials: 'include' });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to load family (${res.status})`);
      }
      const data: FamilyDetail = await res.json();
      setFamily(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load family');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchFamily();
  }, [fetchFamily]);

  const handleAssignSpouse = async (slot: 'spouse1' | 'spouse2', personId: string) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/v1/families/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [slot === 'spouse1' ? 'spouse1_id' : 'spouse2_id']: personId }),
      });
      if (!res.ok) {
        const errData: { message?: string } = await res.json().catch(() => ({}));
        setError(errData.message ?? `Failed to assign spouse (${res.status})`);
        return;
      }
      await fetchFamily();
    } catch {
      setError('Failed to assign spouse');
    }
  };

  const openEdit = () => {
    if (!family) return;
    setEditForm({
      marriage_date: family.marriage_date ?? '',
      marriage_place: family.marriage_place ?? '',
      divorce_date: family.divorce_date ?? '',
      divorce_place: family.divorce_place ?? '',
    });
    setSaveError(null);
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!id || !family) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const body = {
        marriage_date: editForm.marriage_date || null,
        marriage_place: editForm.marriage_place || null,
        divorce_date: editForm.divorce_date || null,
        divorce_place: editForm.divorce_place || null,
      };
      const res = await fetch(`/api/v1/families/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData: { message?: string } = await res.json().catch(() => ({}));
        throw new Error(errData.message ?? `Failed to save (${res.status})`);
      }
      const updated: FamilyDetail = await res.json();
      setFamily(updated);
      setEditMode(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveChild = async (personId: string, childName: string) => {
    if (!id) return;
    setError(null);
    try {
      const res = await fetch(`/api/v1/families/${id}/members/${personId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to remove ${childName} (${res.status})`);
      }
      setFamily((prev) =>
        prev
          ? { ...prev, children: prev.children.filter((c) => c.person_id !== personId) }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove child');
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/families/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to delete family (${res.status})`);
      }
      navigate('/families', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete family');
      setIsDeleting(false);
      setDeleteConfirm(false);
    }
  };

  // --- Loading state ---
  if (isLoading) {
    return (
      <AppShell navbar={<Navbar />} sidebar={<Sidebar context="families" />}>
        <div className={styles.page}>
          <div className={styles.loadingState} aria-busy="true" aria-label="Loading family…">
            <div className={styles.skeletonHeading} />
            <div className={styles.spousesRow}>
              <div className={styles.skeletonCard} />
              <div className={styles.skeletonCard} />
            </div>
            <div className={styles.skeletonSection} />
            <div className={styles.skeletonSection} />
          </div>
        </div>
      </AppShell>
    );
  }

  // --- 404 state ---
  if (notFound) {
    return (
      <AppShell navbar={<Navbar />} sidebar={<Sidebar context="families" />}>
        <div className={styles.page}>
          <div className={styles.centeredState}>
            <div className={styles.centeredIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h2 className={styles.centeredTitle}>Family not found</h2>
            <p className={styles.centeredDesc}>
              This family record does not exist or has been deleted.
            </p>
            <Button variant="primary" size="sm" onClick={() => navigate('/families')}>
              Back to Families
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  // --- Error state (initial load failure) ---
  if (error && !family) {
    return (
      <AppShell navbar={<Navbar />} sidebar={<Sidebar context="families" />}>
        <div className={styles.page}>
          <div className={styles.centeredState}>
            <div className={styles.centeredIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className={styles.centeredTitle}>Something went wrong</h2>
            <p className={styles.centeredDesc}>{error}</p>
            <Button variant="primary" size="sm" onClick={fetchFamily}>
              Try again
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!family) return null;

  const hasMarriageInfo =
    family.marriage_date ||
    family.marriage_place ||
    family.divorce_date ||
    family.divorce_place;

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="families" />}>
      <div className={styles.page}>
        {/* ── Page header ── */}
        <div className={styles.pageHeader}>
          <button className={styles.backBtn} onClick={() => navigate('/families')}>
            ← Families
          </button>
          <div className={styles.headerRow}>
            <h1 className={styles.title}>{familyHeading(family)}</h1>
            {canDelete && (
              <div className={styles.headerActions}>
                {deleteConfirm ? (
                  <div className={styles.confirmDelete}>
                    <span className={styles.confirmText}>Delete this family?</span>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={handleDelete}
                      loading={isDeleting}
                    >
                      Confirm Delete
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirm(false)}
                      disabled={isDeleting}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button variant="danger" size="sm" onClick={() => setDeleteConfirm(true)}>
                    Delete Family
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Inline error banner (post-load errors) ── */}
        {error && (
          <div className={styles.errorBanner} role="alert">
            {error}
          </div>
        )}

        {/* ── Spouses ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Spouses</h2>
          <div className={styles.spousesRow}>
            <SpouseCard
              person={family.spouse1}
              label="Spouse 1"
              canEdit={canEdit}
              onAssign={(pid) => handleAssignSpouse('spouse1', pid)}
            />
            <div className={styles.spouseConnector} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <SpouseCard
              person={family.spouse2}
              label="Spouse 2"
              canEdit={canEdit}
              onAssign={(pid) => handleAssignSpouse('spouse2', pid)}
            />
          </div>
        </section>

        {/* ── Marriage & Divorce info ── */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Marriage &amp; Divorce</h2>
            {canEdit && !editMode && (
              <Button variant="ghost" size="sm" onClick={openEdit}>
                Edit
              </Button>
            )}
          </div>

          {editMode ? (
            <div className={styles.editForm}>
              <div className={styles.editGrid}>
                <label className={styles.editLabel}>
                  <span>Marriage Date</span>
                  <Input
                    value={editForm.marriage_date}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, marriage_date: e.target.value }))
                    }
                    placeholder="e.g. 15 Jun 1990"
                  />
                </label>
                <label className={styles.editLabel}>
                  <span>Marriage Place</span>
                  <Input
                    value={editForm.marriage_place}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, marriage_place: e.target.value }))
                    }
                    placeholder="e.g. London, England"
                  />
                </label>
                <label className={styles.editLabel}>
                  <span>Divorce Date</span>
                  <Input
                    value={editForm.divorce_date}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, divorce_date: e.target.value }))
                    }
                    placeholder="e.g. 2 Mar 2005"
                  />
                </label>
                <label className={styles.editLabel}>
                  <span>Divorce Place</span>
                  <Input
                    value={editForm.divorce_place}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, divorce_place: e.target.value }))
                    }
                    placeholder="e.g. Manchester, England"
                  />
                </label>
              </div>
              {saveError && (
                <div className={styles.saveError} role="alert">
                  {saveError}
                </div>
              )}
              <div className={styles.editActions}>
                <Button variant="primary" size="sm" onClick={handleSave} loading={isSaving}>
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cancelEdit}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : hasMarriageInfo ? (
            <div className={styles.infoGrid}>
              <InfoRow label="Marriage Date" value={family.marriage_date} />
              <InfoRow label="Marriage Place" value={family.marriage_place} />
              {(family.divorce_date || family.divorce_place) && (
                <>
                  <InfoRow label="Divorce Date" value={family.divorce_date} />
                  <InfoRow label="Divorce Place" value={family.divorce_place} />
                </>
              )}
            </div>
          ) : (
            <p className={styles.noInfo}>No marriage or divorce information recorded.</p>
          )}
        </section>

        {/* ── Children ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Children
            {family.children.length > 0 && (
              <span className={styles.childCount}>{family.children.length}</span>
            )}
          </h2>
          {(family.children ?? []).length === 0 ? (
            <p className={styles.noInfo}>No children recorded for this family.</p>
          ) : (
            <ul className={styles.childrenList}>
              {(family.children ?? []).map((child) => {
                const name = personName(child);
                return (
                  <li key={child.id} className={styles.childItem}>
                    <Link to={`/people/${child.person_id}`} className={styles.childName}>
                      {name}
                    </Link>
                    <span className={`${styles.roleBadge} ${ROLE_CSS[child.role]}`}>
                      {ROLE_LABELS[child.role]}
                    </span>
                    {canDelete && (
                      <button
                        className={styles.removeBtn}
                        onClick={() => handleRemoveChild(child.person_id, name)}
                        aria-label={`Remove ${name} from family`}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
};

export default FamilyDetailPage;
