import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import { EventSourceLink } from '@/components/EventSource';
import Navbar from '@/components/Navbar/Navbar';
import Button from '@/components/Button/Button';
import PersonEditModal from '@/components/PersonEditModal/PersonEditModal';
import ActionDrawer from '@/components/archive-object/ActionDrawer';
import ArchiveObjectLayout from '@/components/archive-object/ArchiveObjectLayout';
import ArtifactCard from '@/components/archive-object/ArtifactCard';
import { type ContextActionItem } from '@/components/archive-object/ContextActionsMenu';
import { Label, Input, Select, Textarea, HelperText } from '@/components/Form';
import PersonPicker from '@/components/entity-pickers/PersonPicker';
import { usePageActions } from '@/contexts/PageActionsContext';
import ObjectCollections, { CollectionMembership } from '@/components/ObjectCollections/ObjectCollections';
import { usePermissions } from '@/hooks/usePermissions';
import { useModal } from '@/components/modals/useModal';
import type { FamilySummary } from '@/types/genealogy';
import { getPersonDisplayName } from '@/utils/entityDisplay';
import { parseResearchSections, type ResearchSection } from '@/utils/researchSections';
import {
  formatEventType,
  partitionByKind,
  sortEventsForTimeline,
} from '@/utils/eventTypes';
import { lifespanLabel } from '@/utils/personEvents';
import { formatYear, type DateQualifier } from '@/utils/gedcomDate';
import styles from './PersonDetailPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type NameType = 'birth' | 'married' | 'aka' | 'nickname' | 'formal' | 'religious';
type SexType = 'M' | 'F' | 'X' | 'U';
type ChildRole = 'child' | 'adopted' | 'foster' | 'step';

interface PersonName {
  id: string;
  name_type: NameType;
  prefix: string | null;
  given_name: string | null;
  middle_name: string | null;
  surname: string | null;
  suffix: string | null;
  nickname: string | null;
  is_primary: 0 | 1;
}

interface PersonEvent {
  id: string;
  event_type: string;
  event_date: string | null;
  /** Comes straight from the events table; the API passes the row through. */
  event_date_qualifier?: DateQualifier;
  /** Numeric YYYYMMDD the backend derives from the GEDCOM date, 0 for unknown parts. */
  event_date_sort_key?: number | null;
  event_place: string | null;
  plot: string | null;
  description: string | null;
  source_url: string | null;
  source_url_checked_at: string | null;
}

interface PersonDetail {
  id: string;
  sex: SexType;
  is_living: 0 | 1;
  is_private: 0 | 1;
  notes: string | null;
  displayName?: string | null;
  display_name: string | null;
  created_at: string;
  names: PersonName[];
  events: PersonEvent[];
}

interface PersonSummary {
  id: string;
  displayName?: string | null;
  display_name?: string | null;
  given_name: string | null;
  middle_name?: string | null;
  surname: string | null;
}

interface ChildMember {
  id: string;
  person_id: string;
  displayName?: string | null;
  display_name?: string | null;
  given_name: string | null;
  middle_name?: string | null;
  surname: string | null;
  role: ChildRole;
}

/* The people a parent married apart from the subject's other parent. Shown
   even when they brought no children, because the panel otherwise gives no
   sign a parent remarried. */
interface StepParentGroup {
  via: PersonSummary;
  people: PersonSummary[];
}

/* Children of one of the subject's parents by someone else. `via` names that
   parent, because with both parents remarried an unqualified "half-siblings"
   list does not say which side it runs through. */
interface HalfSiblingGroup {
  via: PersonSummary;
  children: ChildMember[];
}

/* Children of a parent's later spouse by someone else -- no shared ancestry
   with the subject, so they are listed apart from the half-siblings. */
interface StepSiblingGroup {
  via: PersonSummary;
  step_parent: PersonSummary | null;
  children: ChildMember[];
}

interface Relationship {
  family_id: string;
  type: 'parent_family' | 'child_family';
  role: 'spouse1' | 'spouse2' | 'child';
  spouse1: PersonSummary | null;
  spouse2: PersonSummary | null;
  children: ChildMember[];
  step_parents?: StepParentGroup[];
  half_siblings?: HalfSiblingGroup[];
  step_siblings?: StepSiblingGroup[];
}

interface MediaItem {
  id: string;
  filename?: string;
  file_name?: string;
  media_type?: string;
  mime_type?: string;
  url?: string;
  thumbnail_url?: string;
  /** 1 on the one photograph the tree shows for this person, 0 on the rest. */
  is_primary?: number;
}

/* Issue #52. The counts arrive split by role because "5 evidence links" cannot
   say that one of the five disagrees, which is the case claims exist for. */
interface PersonClaim {
  id: string;
  statement: string;
  claim_type: string | null;
  date_text: string | null;
  status: 'open' | 'supported' | 'conflicted' | 'rejected' | 'unknown';
  confidence_level_id: string | null;
  confidence_level_name: string | null;
  confidence_score: number | null;
  evidence_count: number;
  supporting_count: number;
  contradicting_count: number;
  /* Slug of the research-note passage that argues this claim. Null is the
     common case, not missing data: the reasoning may live on another person's
     note, or not be written down yet. */
  research_section: string | null;
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

// ─── Constants ────────────────────────────────────────────────────────────────

const SEX_LABELS: Record<SexType, string> = {
  M: 'Male',
  F: 'Female',
  X: 'Non-binary',
  U: 'Unknown',
};

const NAME_TYPE_LABELS: Record<NameType, string> = {
  birth: 'Birth',
  married: 'Married',
  aka: 'AKA',
  nickname: 'Nickname',
  formal: 'Formal',
  religious: 'Religious',
};

const NAME_TYPE_CSS: Record<NameType, string> = {
  birth: styles.nameTypeBirth,
  married: styles.nameTypeMarried,
  aka: styles.nameTypeAka,
  nickname: styles.nameTypeNickname,
  formal: styles.nameTypeFormal,
  religious: styles.nameTypeReligious,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function personName(p: { displayName?: string | null; display_name?: string | null; given_name: string | null; middle_name?: string | null; surname: string | null } | null): string {
  if (!p) return 'Unknown';
  return getPersonDisplayName(p);
}

/* The role column records child | adopted | foster | step and the panel never
   showed it, so an adopted or foster child read as a birth child. Only the
   exceptions are marked; labelling every birth child "child" is noise. */
const CHILD_ROLE_LABELS: Record<string, string> = {
  adopted: 'adopted',
  foster: 'foster',
  step: 'step',
};

function childRoleLabel(role: string): string | null {
  return CHILD_ROLE_LABELS[role] ?? null;
}

/* One labelled row of people. The count is left to the caller because the
   Parents row reads better without one. */
function RelPersonSection({
  label,
  aside,
  people,
}: {
  label: string;
  aside?: string | null;
  people: PersonSummary[];
}) {
  if (people.length === 0) return null;

  return (
    <div className={styles.relCardSection}>
      <span className={styles.relRoleLabel}>
        {label}
        {aside && <span className={styles.relRoleAside}>{aside}</span>}
      </span>
      <div className={styles.relPersonList}>
        {people.map((p) => (
          <Link key={p.id} to={`/people/${p.id}`} className={styles.relPersonLink}>
            {personName(p)}
          </Link>
        ))}
      </div>
    </div>
  );
}

/* One labelled row of children, with the non-birth roles marked. Every child
   list in the panel goes through it so siblings, half-siblings, step-siblings
   and the person's own children all read the same way. */
function ChildList({
  label,
  aside,
  members,
}: {
  label: string;
  aside?: string | null;
  members: ChildMember[];
}) {
  if (members.length === 0) return null;

  return (
    <div className={styles.relCardSection}>
      <span className={styles.relRoleLabel}>
        {label} ({members.length})
        {aside && <span className={styles.relRoleAside}>{aside}</span>}
      </span>
      <div className={styles.relPersonList}>
        {members.map((c) => {
          const role = childRoleLabel(c.role);
          return (
            <Link key={c.id} to={`/people/${c.person_id}`} className={styles.relPersonLink}>
              {personName(c)}
              {role && <span className={styles.relRoleTag}>{role}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function fullName(name: PersonName): string {
  const nickname = name.nickname ? `"${name.nickname}"` : null;
  const parts = [name.prefix, name.given_name, name.middle_name, nickname, name.surname, name.suffix].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unknown';
}

function primaryName(names: PersonName[]): PersonName | null {
  return names.find((n) => n.is_primary === 1) ?? names[0] ?? null;
}

function mediaDisplayName(item: MediaItem): string {
  return item.filename ?? item.file_name ?? `Media ${item.id.slice(0, 8)}`;
}

function initialsFromName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface InfoRowProps {
  label: string;
  value: string | null;
}

/* ── Claims (#52) ──
   Status is the state of the records; confidence is how settled the conclusion
   is. They are separate on purpose: a claim can be Confirmed with conflicting
   records, which is the normal shape of a settled argument. */
const STATUS_LABELS: Record<PersonClaim['status'], string> = {
  open: 'Open',
  supported: 'Supported',
  conflicted: 'Records conflict',
  rejected: 'Rejected',
  unknown: 'Unknown',
};

/* Drives the pill's fill via a data attribute, so the six confidence colours
   live in the stylesheet with the rest of the tokens rather than inline. An
   unrecognised or missing level falls back to the neutral "unknown" fill. */
const CONFIDENCE_KEYS = ['confirmed', 'probable', 'disputed', 'possible', 'rejected'] as const;

function confidenceKey(name: string | null): string {
  const key = name?.trim().toLowerCase() ?? '';
  return (CONFIDENCE_KEYS as readonly string[]).includes(key) ? key : 'unknown';
}

/* The number earns its place only when it is there: "Confirmed · 95" says more
   than "Confirmed", but "Unknown · null" says less. */
function confidenceLabel(claim: PersonClaim): string {
  const name = claim.confidence_level_name?.trim() || 'Unknown';
  const score = claim.confidence_score;
  return score === null ? name : `${name} · ${score}`;
}

/* The headings are shouted in the prose, which is right in a plain-text note
   and wrong in a contents list, where a dozen capitalised lines are unreadable.
   The section itself keeps the original capitals. */
function sentenceCase(heading: string): string {
  const trimmed = heading.replace(/[.:!?]+$/, '');
  return trimmed.charAt(0) + trimmed.slice(1).toLowerCase();
}

/* A Confirmed conclusion adds no marker anywhere (#52): if every settled date
   carried a badge, none of them would mean anything. Rejected is settled too --
   it has been looked into and ruled out -- so it marks nothing either. What is
   left is the genuinely open middle, plus the ungraded. */
const SETTLED_CONFIDENCE = new Set(['confirmed', 'rejected']);

function isUnsettled(claim: PersonClaim): boolean {
  return !SETTLED_CONFIDENCE.has(confidenceKey(claim.confidence_level_name));
}

/* A claim's date_text is free prose ("20 July 1904") and an event's date is
   GEDCOM-ish ("20 JUL 1904"), so they are compared by year. */
function yearOf(text: string | null | undefined): string | null {
  return text?.match(/\b(1[0-9]{3}|20[0-9]{2})\b/)?.[1] ?? null;
}

/**
 * The unsettled claim governing an event's date, if there is one.
 *
 * This is a heuristic and not a stored link: a claim records its claim_type and
 * its date_text, and nothing yet says which event it is about. Matching a date
 * claim to an event by year is enough to mark a disputed birth differently from
 * a settled one, which is what issue #52 asks for, and it needs no schema
 * change. Step 6's drawer is where someone picks the fact a claim governs, and
 * that is when an exact link can be recorded.
 *
 * Deliberately narrow: only `date` claims, only against a date, and only when
 * the years match. A `medical` or `other` claim governs no displayed fact and
 * must not be made to mark one -- those appear in the summary above instead.
 */
function claimGoverningDate(
  event: { event_date: string | null },
  claims: PersonClaim[],
): PersonClaim | null {
  const eventYear = yearOf(event.event_date);
  if (!eventYear) return null;
  return claims.find(
    claim => claim.claim_type === 'date' && isUnsettled(claim) && yearOf(claim.date_text) === eventYear,
  ) ?? null;
}

/* The claim types this archive actually uses. Deliberately not a longer list:
   these are the ones the card's eyebrow renders and the ones already in use. */
const CLAIM_TYPES = ['parentage', 'name', 'date', 'place', 'relationship', 'medical', 'other'] as const;

const CLAIM_STATUSES: PersonClaim['status'][] = ['open', 'supported', 'conflicted', 'rejected', 'unknown'];

interface ConfidenceLevelOption {
  id: string;
  name: string;
  numeric_value: number | null;
}

interface ClaimFormState {
  statement: string;
  subject_object_id: string;
  claim_type: string;
  date_text: string;
  confidence_level_id: string;
  status: PersonClaim['status'];
  research_section: string;
  notes: string;
}

const EMPTY_CLAIM_FORM: ClaimFormState = {
  statement: '',
  subject_object_id: '',
  claim_type: 'parentage',
  date_text: '',
  confidence_level_id: 'confidence_unknown',
  status: 'open',
  research_section: '',
  notes: '',
};

/* Names the passage under the link, so the reader knows where it goes before
   clicking -- and so a claim whose passage has been rewritten away says so on
   the card rather than only after the jump. */
function sectionTitle(slug: string, sections: ResearchSection[]): string {
  const match = sections.find(section => section.slug === slug);
  return match?.heading ? sentenceCase(match.heading) : 'passage no longer in this note';
}

function evidenceTally(claim: PersonClaim): string {
  if (claim.evidence_count === 0) return 'No evidence attached yet';
  const parts = [`${claim.supporting_count} support`];
  if (claim.contradicting_count > 0) {
    parts.push(`${claim.contradicting_count} contradicts`);
  }
  /* Anything neither supporting nor contradicting -- mentions, uncertain --
     would otherwise vanish from a tally that claims to total the evidence. */
  const other = claim.evidence_count - claim.supporting_count - claim.contradicting_count;
  if (other > 0) parts.push(`${other} other`);
  return parts.join(' · ');
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value }) => (
  <div className={styles.infoRow}>
    <span className={styles.infoLabel}>{label}</span>
    <span className={value ? styles.infoValue : styles.noInfo}>{value ?? '—'}</span>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

const PersonDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const { openModal } = useModal();

  // ── Person ──
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // ── Relationships ──
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [relLoading, setRelLoading] = useState(true);

  // ── Media ──
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(true);
  /* The portrait request in flight, by media id, so one card can show "Saving"
     without disabling the others. Null when nothing is pending. */
  const [portraitSaving, setPortraitSaving] = useState<string | null>(null);

  // ── Archive connections ──
  const [connectedObjects, setConnectedObjects] = useState<ConnectedObject[]>([]);
  // Collection membership is collection_items, not a relationship (#26).
  const [memberOf, setMemberOf] = useState<CollectionMembership[]>([]);
  const [connectedObjectsLoading, setConnectedObjectsLoading] = useState(true);

  // ── Claims (#52) ──
  const [claims, setClaims] = useState<PersonClaim[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(true);

  /* The claim drawer (#52). claimDrawerId is null for a new claim and the
     claim's id when editing one, so the same form serves both. */
  const [claimDrawerOpen, setClaimDrawerOpen] = useState(false);
  const [claimDrawerId, setClaimDrawerId] = useState<string | null>(null);
  const [claimForm, setClaimForm] = useState<ClaimFormState>(EMPTY_CLAIM_FORM);
  const [confidenceLevels, setConfidenceLevels] = useState<ConfidenceLevelOption[]>([]);
  const [claimSaving, setClaimSaving] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  /* A claim links to one section of the research note by slug (#52). The hash
     is the anchor; arriving with one switches to the Research tab and marks the
     section, so the reader lands on the argument rather than at the top of a
     note that runs to thousands of characters. */
  const { hash } = useLocation();
  const targetSection = hash.startsWith('#note-') ? hash.slice(1) : null;

  // ── Delete ──
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Inline post-load error ──
  const [inlineError, setInlineError] = useState<string | null>(null);

  // ── Edit modal ──
  const [showEditModal, setShowEditModal] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [drawerMode, setDrawerMode] = useState<'connect-artifact' | 'add-story' | null>(null);

  // ─── Fetchers ──────────────────────────────────────────────────────────────

  const fetchPerson = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await fetch(`/api/v1/people/${id}`, { credentials: 'include' });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error(`Failed to load person (${res.status})`);
      const data: PersonDetail = await res.json();
      setPerson(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load person');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const fetchRelationships = useCallback(async () => {
    if (!id) return;
    setRelLoading(true);
    try {
      const res = await fetch(`/api/v1/people/${id}/relationships`, { credentials: 'include' });
      if (res.ok) {
        const data: Relationship[] = await res.json();
        setRelationships(data);
      }
    } catch {
      // Non-critical — fail silently, relationships section shows empty state
    } finally {
      setRelLoading(false);
    }
  }, [id]);

  const fetchMedia = useCallback(async () => {
    if (!id) return;
    setMediaLoading(true);
    try {
      const res = await fetch(`/api/v1/media/people/${id}/media`, { credentials: 'include' });
      if (res.ok) {
        const data: MediaItem[] = await res.json();
        setMedia(data);
      }
    } catch {
      // Non-critical — fail silently
    } finally {
      setMediaLoading(false);
    }
  }, [id]);

  /**
   * Choose the photograph the tree shows for this person, or clear the choice
   * by passing null.
   *
   * Nothing falls back: a person with no portrait chosen shows no face in the
   * tree, which is intended. The first photograph on a person is as likely to
   * be a census sheet or a death certificate as a likeness, and guessing is
   * worse than leaving the node blank.
   */
  const handleSetPortrait = useCallback(
    async (mediaId: string | null) => {
      if (!id) return;
      setPortraitSaving(mediaId ?? 'clear');
      try {
        const res = await fetch(`/api/v1/media/people/${id}/portrait`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ media_id: mediaId }),
        });
        if (res.ok) {
          // Re-fetched rather than patched locally: is_primary is a property of
          // the link, and the server has just moved it off whichever row used
          // to hold it. Guessing which that was here would drift.
          await fetchMedia();
        }
      } catch {
        // Non-critical — the flag simply stays where it was.
      } finally {
        setPortraitSaving(null);
      }
    },
    [id, fetchMedia],
  );

  const fetchConnectedObjects = useCallback(async () => {
    if (!id) return;
    setConnectedObjectsLoading(true);
    try {
      const res = await fetch(`/api/v1/relationships/objects/${id}/connected`, { credentials: 'include' });
      if (res.ok) {
        const json = await res.json() as { data: ConnectedObject[] };
        setConnectedObjects(json.data ?? []);
      }
    } catch {
      // Non-critical — connected objects can be empty until Phase 4 data exists.
    } finally {
      setConnectedObjectsLoading(false);
    }
  }, [id]);

  /* Loaded once the drawer is first opened rather than on page load: the list
     never changes and most visits never open the drawer. */
  const fetchConfidenceLevels = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/claims/confidence-levels', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json() as { data: ConfidenceLevelOption[] };
        setConfidenceLevels(json.data ?? []);
      }
    } catch {
      // The select falls back to the ids it already has.
    }
  }, []);

  const openNewClaim = useCallback(() => {
    setClaimDrawerId(null);
    setClaimError(null);
    setClaimForm({
      ...EMPTY_CLAIM_FORM,
      subject_object_id: id ?? '',
    });
    setClaimDrawerOpen(true);
    void fetchConfidenceLevels();
  }, [id, fetchConfidenceLevels]);

  const openEditClaim = useCallback((claim: PersonClaim) => {
    setClaimDrawerId(claim.id);
    setClaimError(null);
    setClaimForm({
      statement: claim.statement,
      subject_object_id: id ?? '',
      claim_type: claim.claim_type ?? 'other',
      date_text: claim.date_text ?? '',
      confidence_level_id: claim.confidence_level_id ?? 'confidence_unknown',
      status: claim.status,
      research_section: claim.research_section ?? '',
      notes: '',
    });
    setClaimDrawerOpen(true);
    void fetchConfidenceLevels();
  }, [id, fetchConfidenceLevels]);

  const fetchClaims = useCallback(async () => {
    if (!id) return;
    setClaimsLoading(true);
    try {
      const res = await fetch(`/api/v1/claims/subject/${id}`, { credentials: 'include' });
      if (res.ok) {
        const json = await res.json() as { data: PersonClaim[] };
        setClaims(json.data ?? []);
      }
    } catch {
      // Non-critical — the tab shows its empty state rather than an error.
    } finally {
      setClaimsLoading(false);
    }
  }, [id]);

  const submitClaim = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!claimForm.statement.trim()) {
      setClaimError('A claim needs a statement.');
      return;
    }
    /* subject_object_id is how findClaimsForSubject finds a claim at all, so a
       claim with no subject would save and then be invisible. */
    if (!claimForm.subject_object_id) {
      setClaimError('A claim needs a subject.');
      return;
    }

    setClaimSaving(true);
    setClaimError(null);
    try {
      const body = {
        statement: claimForm.statement.trim(),
        subject_object_id: claimForm.subject_object_id,
        claim_type: claimForm.claim_type,
        /* Only carried for a date claim: it is what matches a claim to the
           date it governs, and on any other type it would be noise. */
        date_text: claimForm.claim_type === 'date' ? claimForm.date_text.trim() : '',
        confidence_level_id: claimForm.confidence_level_id,
        status: claimForm.status,
        research_section: claimForm.research_section,
        notes: claimForm.notes.trim(),
      };
      const res = await fetch(
        claimDrawerId ? `/api/v1/claims/${claimDrawerId}` : '/api/v1/claims',
        {
          method: claimDrawerId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error(claimDrawerId ? 'Failed to save the claim.' : 'Failed to create the claim.');

      /* Back to the Claims tab with the card visible, rather than away to
         /claims/:id -- the reader is on this person and stays there. */
      setClaimDrawerOpen(false);
      setActiveTab('claims');
      await fetchClaims();
    } catch (error) {
      setClaimError(error instanceof Error ? error.message : 'Failed to save the claim.');
    } finally {
      setClaimSaving(false);
    }
  }, [claimForm, claimDrawerId, fetchClaims]);

  useEffect(() => {
    fetchPerson();
    fetchRelationships();
    fetchMedia();
    fetchConnectedObjects();
    fetchClaims();
  }, [fetchPerson, fetchRelationships, fetchMedia, fetchConnectedObjects, fetchClaims]);

  // ─── Context actions (registered in the global topbar Actions menu) ───────

  /* Derived, never stored: a claim records only the slug, so re-ordering a note
     cannot silently repoint an anchor the way a stored paragraph index would. */
  const researchSections = React.useMemo(
    () => parseResearchSections(person?.notes),
    [person?.notes],
  );
  const headedSections = React.useMemo(
    () => researchSections.filter(section => section.slug),
    [researchSections],
  );

  /* Confirmed and Rejected are both settled, so neither surfaces here (#52). */
  const unsettledClaims = React.useMemo(() => claims.filter(isUnsettled), [claims]);

  /* Arriving on a section link lands on the Overview tab by default, which
     hides the passage the link was for. */
  useEffect(() => {
    if (targetSection) setActiveTab('research');
  }, [targetSection]);

  /* The browser does its own hash scroll on load, before the Research tab has
     rendered -- so the element it was looking for did not exist yet. Scroll
     once the section is actually in the document. */
  useEffect(() => {
    if (!targetSection || activeTab !== 'research') return;
    document.getElementById(targetSection)?.scrollIntoView?.({ block: 'start' });
  }, [targetSection, activeTab, researchSections]);

  const primary = person ? primaryName(person.names) : null;
  const displayTitle = person
    ? person.displayName?.trim() || person.display_name?.trim() || (primary ? fullName(primary) : 'Unknown Person')
    : '';

  const handleAddFamily = async () => {
    const result = await openModal<FamilySummary>('FamilyEditor', {
      mode: 'create',
      defaults: { spouse1_id: id },
    });
    if (result.action === 'created') navigate(`/families/${result.entity.id}`);
  };

  const contextActions: ContextActionItem[] = [
    {
      id: 'connect-artifact',
      label: 'Connect Artifact',
      description: 'Link this person to a preserved item',
      disabled: !canCreate,
      onSelect: () => setDrawerMode('connect-artifact'),
    },
    {
      id: 'add-story',
      label: 'Add Story',
      description: 'Preserve a memory or explanation',
      disabled: !canCreate,
      onSelect: () => setDrawerMode('add-story'),
    },
    {
      id: 'add-family',
      label: 'Add Family',
      description: 'Create a family relationship record',
      disabled: !canCreate,
      onSelect: handleAddFamily,
    },
    {
      id: 'edit-person',
      label: 'Edit Person',
      description: 'Names, privacy, notes, and identity',
      group: 'manage',
      disabled: !canEdit,
      onSelect: () => setShowEditModal(true),
    },
    {
      id: 'delete-person',
      label: 'Delete Person',
      description: 'Remove this person record',
      group: 'manage',
      danger: true,
      disabled: !canDelete,
      onSelect: () => setDeleteConfirm(true),
    },
  ];

  usePageActions(person ? `Actions for ${displayTitle}` : '', person ? contextActions : []);

  // ─── Delete handler ────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/people/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed to delete person (${res.status})`);
      navigate('/people', { replace: true });
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Failed to delete person');
      setIsDeleting(false);
      setDeleteConfirm(false);
    }
  };

  // ─── Guard renders ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <AppShell navbar={<Navbar />}>
        <div className={styles.page}>
          <div className={styles.pageInner}>
            <div className={styles.loadingState} aria-busy="true" aria-label="Loading person…">
              <div className={styles.skeletonHeading} />
              <div className={styles.contentGrid}>
                <div className={styles.leftCol}>
                  <div className={styles.skeletonSection} />
                  <div className={styles.skeletonSection} />
                </div>
                <div className={styles.rightCol}>
                  <div className={styles.skeletonSection} />
                  <div className={styles.skeletonSection} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (notFound) {
    return (
      <AppShell navbar={<Navbar />}>
        <div className={styles.page}>
          <div className={styles.pageInner}>
            <div className={styles.centeredState}>
              <div className={styles.centeredIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <h2 className={styles.centeredTitle}>Person not found</h2>
              <p className={styles.centeredDesc}>
                This person record does not exist or has been deleted.
              </p>
              <Button variant="primary" size="sm" onClick={() => navigate('/people')}>
                Back to People
              </Button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (error && !person) {
    return (
      <AppShell navbar={<Navbar />}>
        <div className={styles.page}>
          <div className={styles.pageInner}>
            <div className={styles.centeredState}>
              <div className={styles.centeredIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <h2 className={styles.centeredTitle}>Something went wrong</h2>
              <p className={styles.centeredDesc}>{error}</p>
              <Button variant="primary" size="sm" onClick={fetchPerson}>
                Try again
              </Button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!person) return null;

  // ─── Derived values ────────────────────────────────────────────────────────

  const sortedEventsList = sortEventsForTimeline(person.events);
  // Attributes describe the person rather than occurring at a moment, so they
  // are listed separately instead of interleaved into the timeline (#32).
  const { events: timelineEvents, attributes } = partitionByKind(sortedEventsList);
  const childFamilies = relationships.filter((r) => r.type === 'child_family');
  const parentFamilies = relationships.filter((r) => r.type === 'parent_family');

  const connectedArtifacts = connectedObjects.filter((o) => o.object_type === 'artifact');
  const connectedStories = connectedObjects.filter((o) => o.object_type === 'story');

  /**
   * One list of this person's artifacts, merged from the two tables that
   * describe them.
   *
   * person_media is the legacy link and carries the file to display;
   * relationships is the archive model and carries the catalogued title and
   * type. The media-to-artifact bridge gives an artifact the media item's own
   * id, so the two are joined on it. Before 063 backfilled the relationships
   * these lists barely overlapped and the page showed them as separate
   * sections; afterwards that listed every photograph twice, once with a
   * thumbnail and once as a placeholder card.
   *
   * Merging also fixes the placeholders: a connected artifact had no image to
   * show until the media row was joined to it.
   */
  const personArtifacts = ((): Array<{
    id: string;
    title: string;
    typeName: string | null;
    subtitle: string | null;
    media: MediaItem | null;
  }> => {
    const byId = new Map<string, {
      id: string;
      title: string;
      typeName: string | null;
      subtitle: string | null;
      media: MediaItem | null;
    }>();

    for (const object of connectedArtifacts) {
      byId.set(object.object_id, {
        id: object.object_id,
        title: object.title,
        typeName: object.artifact_type_name,
        subtitle: object.artifact_type_name ?? object.relationship_type_name,
        media: null,
      });
    }

    for (const item of media) {
      const existing = byId.get(item.id);
      if (existing) {
        existing.media = item;
        continue;
      }
      // Linked as media but never bridged into the archive model. It still
      // belongs on this tab, so it is listed from what the media row knows.
      byId.set(item.id, {
        id: item.id,
        title: mediaDisplayName(item),
        typeName: null,
        subtitle: null,
        media: item,
      });
    }

    return [...byId.values()];
    // Derived inline rather than with useMemo: this sits below the
    // `if (!person) return null` guard above, so a hook here would change the
    // hook count between renders -- React's "Rendered more hooks than during
    // the previous render". The list is a few dozen items at most.
  })();

  const artifactCount = personArtifacts.length;
  const familyRoles = new Map<string, string>();
  childFamilies.forEach((rel) => {
    [rel.spouse1, rel.spouse2].forEach((p) => {
      if (p) familyRoles.set(p.id, 'Parent');
    });
  });
  parentFamilies.forEach((rel) => {
    const other = rel.role === 'spouse1' ? rel.spouse2 : rel.spouse1;
    if (other) familyRoles.set(other.id, 'Spouse');
    rel.children.forEach((c) => familyRoles.set(c.person_id, 'Child'));
  });

  // ─── Full render ───────────────────────────────────────────────────────────

  return (
    <AppShell navbar={<Navbar />}>
      <div className={styles.page}>
        <div className={styles.pageInner}>
        {/* ── Inline error banner ── */}
        {inlineError && (
          <div className={styles.errorBanner} role="alert">
            {inlineError}
          </div>
        )}

        {deleteConfirm && (
          <div className={styles.errorBanner} role="alert">
            <div className={styles.confirmDelete}>
              <span className={styles.confirmText}>Delete this person?</span>
              <Button variant="danger" size="sm" onClick={handleDelete} loading={isDeleting}>Confirm Delete</Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(false)} disabled={isDeleting}>Cancel</Button>
            </div>
          </div>
        )}

        <ArchiveObjectLayout
          breadcrumb={<><Link to="/people">People</Link> / Archive Profile</>}
          title={displayTitle}
          subtitle={[
            lifespanLabel(person.events),
            person.is_living === 1 ? 'Living' : 'Deceased',
            SEX_LABELS[person.sex],
            person.is_private === 1 ? 'Private' : null,
          ].filter(Boolean).join(' • ')}
          /* NOT person.notes -- see issue #51. The header renders its summary
             unclamped, and research notes on this archive run to thousands of
             characters (9,274 on the longest), which pushed the stats, the tabs
             and every fact below the fold. The notes now live on the Research
             tab, with a clamped preview on Overview. */
          summary={null}
          avatar={<span>{initialsFromName(displayTitle)}</span>}
          headerAction={(
            <Button variant="secondary" onClick={() => navigate('/')}>View in Tree</Button>
          )}
          stats={[
            { label: 'Artifacts', value: artifactCount },
            { label: 'Stories', value: connectedStories.length },
            { label: 'Events', value: timelineEvents.length },
            { label: 'Facts', value: attributes.length },
            { label: 'Collections', value: memberOf.length },
            { label: 'Families', value: relationships.length },
          ]}
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'timeline', label: 'Timeline', count: timelineEvents.length },
            { id: 'artifacts', label: 'Artifacts', count: artifactCount },
            { id: 'stories', label: 'Stories', count: connectedStories.length },
            { id: 'collections', label: 'Collections', count: memberOf.length },
            { id: 'family', label: 'Family', count: relationships.length },
            { id: 'research', label: 'Research' },
            { id: 'claims', label: 'Claims', count: claims.length },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        >
          {activeTab === 'overview' && (
            <div className={styles.tabStack}>

            {/* ── Recent Artifacts ── */}
            <section className={styles.section} aria-labelledby="recent-artifacts-heading">
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle} id="recent-artifacts-heading">
                  Recent Artifacts
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab('artifacts')}>
                  View all
                </Button>
              </div>
              {/* Draws on the same merged list as the Artifacts tab, so the
                  overview cannot disagree with it -- and so these cards show
                  the photographs rather than a placeholder glyph. */}
              {connectedObjectsLoading || mediaLoading ? (
                <div className={styles.skeletonLine} aria-hidden="true" />
              ) : personArtifacts.length === 0 ? (
                <p className={styles.noInfo}>No artifacts connected yet. Use Actions → Connect Artifact.</p>
              ) : (
                <div className={styles.cardGrid}>
                  {personArtifacts.slice(0, 3).map((artifact) => (
                    <ArtifactCard
                      key={artifact.id}
                      href={`/artifacts/${artifact.id}`}
                      title={artifact.title}
                      subtitle={artifact.subtitle}
                      typeName={artifact.typeName}
                      /* The endpoint serves the generated thumbnail where one
                         exists and the original where it does not. No
                         thumbnail_url fallback: nothing in the backend has
                         ever populated that field. */
                      imageSrc={artifact.media ? `/api/v1/media/${artifact.media.id}/thumbnail` : null}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* ── What is not settled (#52) ──
                Every unsettled claim, including the ones that govern no fact
                shown on this page -- a cause of death or a kinship has nowhere
                else to surface, and inventing a vital for it to mark would be
                worse than listing it here. Confirmed claims are absent on
                purpose; this band appears only when something is open. */}
            {unsettledClaims.length > 0 && (
              <section className={styles.section} aria-labelledby="unsettled-heading">
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle} id="unsettled-heading">
                    Not Settled
                    <span className={styles.countBadge}>{unsettledClaims.length}</span>
                  </h2>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('claims')}>
                    All claims
                  </Button>
                </div>
                <ul className={styles.unsettledList}>
                  {unsettledClaims.map((claim) => (
                    <li key={claim.id} className={styles.unsettledItem}>
                      <span
                        className={styles.confidencePill}
                        data-confidence={confidenceKey(claim.confidence_level_name)}
                      >
                        {confidenceLabel(claim)}
                      </span>
                      <Link to={`/claims/${claim.id}`} className={styles.unsettledStatement}>
                        {claim.statement}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ── Key Life Context ── */}
            <section className={styles.section} aria-labelledby="life-context-heading">
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle} id="life-context-heading">
                  Key Life Context
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab('timeline')}>
                  Timeline
                </Button>
              </div>
              {timelineEvents.length === 0 ? (
                <p className={styles.noInfo}>No events recorded.</p>
              ) : (
                <ol className={styles.eventsList} aria-label="Key life events">
                  {timelineEvents.slice(0, 3).map((event) => (
                    <li key={event.id} className={styles.eventItem}>
                      <div className={styles.eventDot} aria-hidden="true" />
                      <div className={styles.eventContent}>
                        <div className={styles.eventHeader}>
                          {/* The event is its own page, and that is where its
                              media lives: a wake's photographs hang off the
                              event, not off the person, so the name has to be
                              the way through to them. */}
                          <Link className={styles.eventType} to={`/events/${event.id}`}>
                            {formatEventType(event.event_type)}
                          </Link>
                          <div className={styles.eventHeaderRight}>
                            {event.event_date && (() => {
                              /* A disputed date must not look like a settled
                                 one -- here or on the Timeline. The marker is a
                                 dotted underline plus the level's own pill, so
                                 it never rests on colour alone. */
                              const governing = claimGoverningDate(event, claims);
                              return (
                                <>
                                  <span
                                    className={styles.eventDate}
                                    data-unsettled={governing ? 'true' : undefined}
                                  >
                                    {event.event_date}
                                  </span>
                                  {governing && (
                                    <Link
                                      to={`/claims/${governing.id}`}
                                      className={styles.confidencePill}
                                      data-confidence={confidenceKey(governing.confidence_level_name)}
                                      title={governing.statement}
                                    >
                                      {confidenceLabel(governing)}
                                    </Link>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                        {(event.event_place || event.plot) && (
                          <div className={styles.eventPlace}>
                            📍 {[event.event_place, event.plot].filter(Boolean).join(' — ')}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* ── Basic Information ── */}
            <section className={styles.section} aria-labelledby="basic-info-heading">
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle} id="basic-info-heading">
                  Basic Information
                </h2>
              </div>

              {/* Read-only info grid */}
              <div className={styles.infoGrid}>
                <InfoRow label="Sex" value={SEX_LABELS[person.sex]} />

                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Status</span>
                  <span
                    className={`${styles.statusBadge} ${
                      person.is_living === 1 ? styles.statusLiving : styles.statusDeceased
                    }`}
                  >
                    {person.is_living === 1 ? 'Living' : 'Deceased'}
                  </span>
                </div>

                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Privacy</span>
                  {person.is_private === 1 ? (
                    <span className={styles.privateBadge}>Private</span>
                  ) : (
                    <span className={styles.infoValue}>Public</span>
                  )}
                </div>

                {person.created_at && (
                  <InfoRow
                    label="Added"
                    value={new Date(person.created_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  />
                )}
              </div>
            </section>

            {/* ── Names ── */}
            <section className={styles.section} aria-labelledby="names-heading">
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle} id="names-heading">
                  Names
                  {person.names.length > 0 && (
                    <span className={styles.countBadge}>{person.names.length}</span>
                  )}
                </h2>
              </div>

              {person.names.length === 0 ? (
                <p className={styles.noInfo}>No names recorded.</p>
              ) : (
                <ul className={styles.namesList}>
                  {person.names.map((name, index) => (
                    <li key={name.id ?? `${name.name_type}-${fullName(name)}-${index}`} className={styles.nameItem}>
                      <div className={styles.nameItemMain}>
                        <span className={styles.nameText}>{fullName(name)}</span>
                        <span
                          className={`${styles.nameTypeBadge} ${NAME_TYPE_CSS[name.name_type]}`}
                        >
                          {NAME_TYPE_LABELS[name.name_type]}
                        </span>
                        {name.is_primary === 1 && (
                          <span className={styles.primaryBadge}>Primary</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── Research (preview; the full text is on the Research tab) ── */}
            {person.notes && (
              <section className={styles.section} aria-labelledby="notes-heading">
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle} id="notes-heading">
                    Research
                  </h2>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('research')}>
                    Read all
                  </Button>
                </div>
                {/* Clamped to a few lines. The clamp is CSS, so the whole note
                    is still in the DOM for find-in-page and for screen readers
                    that ignore overflow. */}
                <p className={`${styles.notesText} ${styles.notesPreview}`}>{person.notes}</p>
              </section>
            )}
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className={styles.tabStack}>
            {/* ── Events timeline ── */}
            <section className={styles.section} aria-labelledby="events-heading">
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle} id="events-heading">
                  Events
                  {timelineEvents.length > 0 && (
                    <span className={styles.countBadge}>{timelineEvents.length}</span>
                  )}
                </h2>
              </div>

              {timelineEvents.length === 0 ? (
                <p className={styles.noInfo}>No events recorded.</p>
              ) : (
                <ol className={styles.eventsList} aria-label="Life events timeline">
                  {timelineEvents.map((event) => (
                    <li key={event.id} className={styles.eventItem}>
                      <div className={styles.eventDot} aria-hidden="true" />
                      <div className={styles.eventContent}>
                        <div className={styles.eventHeader}>
                          <Link className={styles.eventType} to={`/events/${event.id}`}>
                            {formatEventType(event.event_type)}
                          </Link>
                          <div className={styles.eventHeaderRight}>
                            {event.event_date && (() => {
                              /* A disputed date must not look like a settled
                                 one -- here or on the Timeline. The marker is a
                                 dotted underline plus the level's own pill, so
                                 it never rests on colour alone. */
                              const governing = claimGoverningDate(event, claims);
                              return (
                                <>
                                  <span
                                    className={styles.eventDate}
                                    data-unsettled={governing ? 'true' : undefined}
                                  >
                                    {event.event_date}
                                  </span>
                                  {governing && (
                                    <Link
                                      to={`/claims/${governing.id}`}
                                      className={styles.confidencePill}
                                      data-confidence={confidenceKey(governing.confidence_level_name)}
                                      title={governing.statement}
                                    >
                                      {confidenceLabel(governing)}
                                    </Link>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                        {(event.event_place || event.plot) && (
                          <div className={styles.eventPlace}>
                            📍 {[event.event_place, event.plot].filter(Boolean).join(' — ')}
                          </div>
                        )}
                        {event.description && (
                          <div className={styles.eventDesc}>{event.description}</div>
                        )}
                        {event.source_url && (
                          <div className={styles.eventDesc}>
                            <EventSourceLink
                              url={event.source_url}
                              checkedAt={event.source_url_checked_at}
                            />
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* ── Facts & attributes ── */}
            {attributes.length > 0 && (
              <section className={styles.section} aria-labelledby="attributes-heading">
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle} id="attributes-heading">
                    Facts &amp; Attributes
                    <span className={styles.countBadge}>{attributes.length}</span>
                  </h2>
                </div>

                <div className={styles.infoGrid}>
                  {attributes.map((attribute) => (
                    <div key={attribute.id} className={styles.infoRow}>
                      <span className={styles.infoLabel}>
                        {formatEventType(attribute.event_type)}
                      </span>
                      <span className={styles.infoValue}>
                        {attribute.description || '—'}
                        {attribute.event_date && (
                          // Raw GEDCOM reads "BET 1985 AND 1992" on screen; the
                          // shared helper renders that span as "1985–1992" and
                          // carries the other qualifiers as "abt.", "bef." and
                          // so on.
                          <span className={styles.eventDate}>
                            {' · '}
                            {formatYear(attribute.event_date, attribute.event_date_qualifier) || attribute.event_date}
                          </span>
                        )}
                        {(attribute.event_place || attribute.plot) && (
                          <span className={styles.eventPlace}>
                            {' '}📍 {[attribute.event_place, attribute.plot].filter(Boolean).join(' — ')}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            </div>
          )}

          {activeTab === 'family' && (
            <div className={styles.tabStack}>
            {/* ── Relationships ── */}
            <section className={styles.section} aria-labelledby="relationships-heading">
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle} id="relationships-heading">
                  Relationships
                </h2>
              </div>

              {relLoading ? (
                <div className={styles.skeletonLine} aria-hidden="true" />
              ) : relationships.length === 0 ? (
                <p className={styles.noInfo}>No family relationships recorded.</p>
              ) : (
                <div className={styles.relGroups}>

                  {/* ── As a child ── */}
                  {childFamilies.length > 0 && (
                    <div className={styles.relGroup}>
                      <h3 className={styles.relGroupTitle}>As a child</h3>
                      {childFamilies.map((rel) => {
                        const parents = [rel.spouse1, rel.spouse2].filter(
                          (p): p is PersonSummary => p !== null,
                        );
                        const siblings = rel.children.filter((c) => c.person_id !== id);

                        return (
                          <div key={rel.family_id} className={styles.relCard}>
                            <div className={styles.relCardSection}>
                              <span className={styles.relRoleLabel}>Parents</span>
                              {parents.length === 0 ? (
                                <span className={styles.noInfo}>Unknown parents</span>
                              ) : (
                                <div className={styles.relPersonList}>
                                  {parents.map((p) => (
                                    <Link
                                      key={p.id}
                                      to={`/people/${p.id}`}
                                      className={styles.relPersonLink}
                                    >
                                      {personName(p)}
                                    </Link>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Not ancestors of this person, so they sit
                                below the parents rather than among them. */}
                            {(rel.step_parents ?? []).map((group) => (
                              <RelPersonSection
                                key={`step-parent-${group.via.id}`}
                                label={`Step-parents (${group.people.length})`}
                                aside={`via ${personName(group.via)}`}
                                people={group.people}
                              />
                            ))}

                            <ChildList label="Siblings" members={siblings} />

                            {/* Children of one parent by someone else, kept
                                out of the sibling list and named after the
                                parent they run through. */}
                            {(rel.half_siblings ?? []).map((group) => (
                              <ChildList
                                key={`half-${group.via.id}`}
                                label="Half-siblings"
                                aside={`via ${personName(group.via)}`}
                                members={group.children}
                              />
                            ))}

                            {(rel.step_siblings ?? []).map((group) => (
                              <ChildList
                                key={`step-${group.via.id}-${group.step_parent?.id ?? 'unknown'}`}
                                label="Step-siblings"
                                aside={
                                  group.step_parent
                                    ? `via ${personName(group.via)}, with ${personName(group.step_parent)}`
                                    : `via ${personName(group.via)}`
                                }
                                members={group.children}
                              />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── As a spouse / parent ── */}
                  {parentFamilies.length > 0 && (
                    <div className={styles.relGroup}>
                      <h3 className={styles.relGroupTitle}>As a spouse / parent</h3>
                      {parentFamilies.map((rel) => {
                        // Determine which spouse slot this person occupies, show the other
                        const otherSpouse = rel.role === 'spouse1' ? rel.spouse2 : rel.spouse1;

                        return (
                          <div key={rel.family_id} className={styles.relCard}>
                            <div className={styles.relCardSection}>
                              <span className={styles.relRoleLabel}>Spouse</span>
                              {otherSpouse ? (
                                <div className={styles.relPersonList}>
                                  <Link
                                    to={`/people/${otherSpouse.id}`}
                                    className={styles.relPersonLink}
                                  >
                                    {personName(otherSpouse)}
                                  </Link>
                                </div>
                              ) : (
                                <span className={styles.noInfo}>Not recorded</span>
                              )}
                            </div>

                            <ChildList label="Children" members={rel.children} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>
            </div>
          )}

          {activeTab === 'artifacts' && (
            <div className={styles.tabStack}>
            {/* ── Artifacts ──
                One section, merged from person_media and the archive model.
                See personArtifacts above for why they are joined rather than
                listed separately. */}
            <section className={styles.section} aria-labelledby="artifacts-heading">
              <h2 className={styles.sectionTitle} id="artifacts-heading">
                Artifacts
                {personArtifacts.length > 0 && (
                  <span className={styles.countBadge}>{personArtifacts.length}</span>
                )}
              </h2>

              {mediaLoading || connectedObjectsLoading ? (
                <div className={styles.skeletonLine} aria-hidden="true" />
              ) : personArtifacts.length === 0 ? (
                <p className={styles.noInfo}>No artifacts connected to this person yet.</p>
              ) : (
                <div className={styles.cardGrid}>
                  {personArtifacts.map((artifact) => {
                    /* The control is offered only on a photograph the tree
                       could actually draw. A PDF is excluded deliberately:
                       libvips here carries no poppler, so a PDF never gets a
                       thumbnail, and choosing one as a portrait sets a flag
                       that leaves the node as blank as before. That is the
                       exact trap this control exists to close, not to
                       reproduce. */
                    const m = artifact.media;
                    const canBePortrait = Boolean(m && m.mime_type?.startsWith('image/'));
                    const isPortrait = Boolean(m?.is_primary);
                    const saving = portraitSaving === m?.id || (isPortrait && portraitSaving === 'clear');

                    return (
                      <ArtifactCard
                        key={artifact.id}
                        href={`/artifacts/${artifact.id}`}
                        title={artifact.title}
                        subtitle={artifact.subtitle}
                        typeName={artifact.typeName}
                        /* The endpoint serves the generated thumbnail where one
                           exists and the original where it does not. No
                           thumbnail_url fallback: nothing in the backend has
                           ever populated that field. */
                        imageSrc={m ? `/api/v1/media/${m.id}/thumbnail` : null}
                        action={
                          canBePortrait && m ? (
                            <button
                              type="button"
                              className={isPortrait ? styles.portraitButtonOn : styles.portraitButton}
                              disabled={saving}
                              aria-pressed={isPortrait}
                              onClick={() => handleSetPortrait(isPortrait ? null : m.id)}
                            >
                              {saving
                                ? 'Saving…'
                                : isPortrait
                                  ? '★ Portrait — click to clear'
                                  : 'Set as portrait'}
                            </button>
                          ) : null
                        }
                      />
                    );
                  })}
                </div>
              )}
            </section>
            </div>
          )}

          {activeTab === 'stories' && (
            <section className={styles.section} aria-labelledby="stories-heading">
              <h2 className={styles.sectionTitle} id="stories-heading">
                Stories
                {connectedStories.length > 0 && (
                  <span className={styles.countBadge}>{connectedStories.length}</span>
                )}
              </h2>

              {connectedObjectsLoading ? (
                <div className={styles.skeletonLine} aria-hidden="true" />
              ) : connectedStories.length === 0 ? (
                <p className={styles.noInfo}>No stories connected to this person yet. Use Actions → Add Story.</p>
              ) : (
                <div className={styles.relPersonList}>
                  {connectedStories.map((story) => (
                    <Link
                      key={`${story.relationship_id}-${story.object_id}`}
                      to={`/stories/${story.object_id}`}
                      className={styles.relPersonLink}
                    >
                      {story.title}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === 'collections' && (
            <section className={styles.section} aria-labelledby="collections-heading">
              <h2 className={styles.sectionTitle} id="collections-heading">
                Collections
                {memberOf.length > 0 && <span className={styles.countBadge}>{memberOf.length}</span>}
              </h2>

              <ObjectCollections
                objectId={person.id}
                canEdit={canEdit}
                canDelete={canDelete}
                onChange={setMemberOf}
              />
            </section>
          )}

          {activeTab === 'research' && (
            <section className={styles.section} aria-labelledby="research-heading">
              <h2 className={styles.sectionTitle} id="research-heading">Research</h2>
              {!person.notes ? (
                <p className={styles.noInfo}>
                  No research notes recorded for {displayTitle} yet.
                </p>
              ) : (
                <>
                  {/* Promised by a claim link that no longer resolves. Saying so
                      beats scrolling the reader to a passage that is not the
                      one the claim meant. */}
                  {targetSection && !researchSections.some(s => s.slug === targetSection) && (
                    <p className={styles.anchorLost} role="status">
                      The linked passage is no longer in this note — it may have been
                      rewritten. The whole note is below.
                    </p>
                  )}

                  {headedSections.length > 1 && (
                    <nav className={styles.noteToc} aria-label="Sections of this note">
                      <div className={styles.noteTocLabel}>In this note</div>
                      <ul>
                        {headedSections.map((section) => (
                          <li key={section.slug}>
                            <a href={`#${section.slug}`}>{sentenceCase(section.heading!)}</a>
                          </li>
                        ))}
                      </ul>
                    </nav>
                  )}

                  <div className={styles.noteBody}>
                    {researchSections.map((section, index) => (
                      <div
                        key={section.slug ?? `prose-${index}`}
                        id={section.slug ?? undefined}
                        className={styles.noteSection}
                        data-linked={section.slug && section.slug === targetSection ? 'true' : undefined}
                      >
                        {section.slug === targetSection && (
                          <span className={styles.linkedFlag} role="status">Linked from a claim</span>
                        )}
                        {section.heading && (
                          <h3 className={styles.noteHeading}>{section.heading}</h3>
                        )}
                        {section.body && <p className={styles.notesText}>{section.body}</p>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {activeTab === 'claims' && (
            <section className={styles.section} aria-labelledby="claims-heading">
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle} id="claims-heading">
                Claims
                {claims.length > 0 && <span className={styles.countBadge}>{claims.length}</span>}
                </h2>
                {canCreate && (
                  <Button variant="secondary" size="sm" onClick={openNewClaim}>
                    New Claim
                  </Button>
                )}
              </div>

              {claimsLoading ? (
                <div className={styles.skeletonLine} aria-hidden="true" />
              ) : claims.length === 0 ? (
                <p className={styles.noInfo}>
                  No claims recorded for {displayTitle} yet. A claim records one conclusion and how
                  settled it is, with the records that bear on it.
                </p>
              ) : (
                <>
                  <p className={styles.claimsLede}>
                    What this archive has concluded about {displayTitle}, and how settled each
                    conclusion is. A filled pill is confidence; an outline chip is the state of the
                    records. The reasoning stays on the Research tab.
                  </p>
                  <div className={styles.claimList}>
                    {claims.map((claim) => (
                      <article key={claim.id} className={styles.claimCard}>
                        {claim.claim_type && (
                          <div className={styles.claimType}>{claim.claim_type}</div>
                        )}
                        <h3 className={styles.claimStatement}>
                          <Link to={`/claims/${claim.id}`}>{claim.statement}</Link>
                        </h3>
                        <div className={styles.claimMeta}>
                          <span
                            className={styles.confidencePill}
                            data-confidence={confidenceKey(claim.confidence_level_name)}
                          >
                            {confidenceLabel(claim)}
                          </span>
                          <span className={styles.statusChip}>{STATUS_LABELS[claim.status]}</span>
                          <span className={styles.evidenceTally}>{evidenceTally(claim)}</span>
                        </div>

                        {/* The claim carries the conclusion and points at the
                            argument; it never carries the argument itself. With
                            no anchor recorded it opens the note at the top and
                            says so, rather than implying a precision it has
                            not got. */}
                        <div className={styles.claimFooter}>
                          {canEdit && (
                            <Button variant="ghost" size="sm" onClick={() => openEditClaim(claim)}>
                              Edit
                            </Button>
                          )}
                          {claim.research_section ? (
                            <>
                              {/* A Link, not a bare <a href="#...">: an in-page
                                  anchor fires hashchange, which useLocation does
                                  not observe, so the tab would never switch. */}
                              <Link
                                className={styles.argumentLink}
                                to={{ hash: claim.research_section }}
                              >
                                Read the argument →
                              </Link>
                              <span className={styles.argumentHint}>
                                Research tab · {sectionTitle(claim.research_section, researchSections)}
                              </span>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className={styles.argumentLinkButton}
                                onClick={() => setActiveTab('research')}
                              >
                                Open the research note →
                              </button>
                              <span className={styles.argumentHint}>No section anchor recorded</span>
                            </>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}
        </ArchiveObjectLayout>
        </div>
      </div>

      {/* ── Claim drawer (#52) ──
          One form for both: claimDrawerId is null when creating and the
          claim's id when editing, and the submit path picks POST or PUT from
          that. The research-section select is what makes "Read the argument"
          work for a claim somebody enters by hand rather than one a migration
          wrote. */}
      <ActionDrawer
        open={claimDrawerOpen}
        title={claimDrawerId ? 'Edit Claim' : 'New Claim'}
        description="A claim records one conclusion and how settled it is. The reasoning stays in the research note; the claim points at it."
        onClose={() => setClaimDrawerOpen(false)}
      >
        <form className={styles.claimForm} onSubmit={submitClaim}>
          {claimError && <div className={styles.errorBanner} role="alert">{claimError}</div>}

          <div className={styles.claimField}>
            <Label htmlFor="claim-statement">Statement</Label>
            <Textarea
              id="claim-statement"
              rows={3}
              value={claimForm.statement}
              onChange={(e) => setClaimForm({ ...claimForm, statement: e.target.value })}
            />
            <HelperText>One conclusion, in a sentence. Not the argument for it.</HelperText>
          </div>

          <div className={styles.claimField}>
            <PersonPicker
              label="Subject"
              value={claimForm.subject_object_id || null}
              onSelect={(selected) => setClaimForm({ ...claimForm, subject_object_id: selected.id })}
              onClear={() => setClaimForm({ ...claimForm, subject_object_id: '' })}
            />
            <HelperText>Prefilled with the person whose page this is.</HelperText>
          </div>

          <div className={styles.claimFieldRow}>
            <div className={styles.claimField}>
              <Label htmlFor="claim-type">Type</Label>
              <Select
                id="claim-type"
                value={claimForm.claim_type}
                onChange={(e) => setClaimForm({ ...claimForm, claim_type: e.target.value })}
              >
                {CLAIM_TYPES.map((type) => (
                  <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                ))}
              </Select>
            </div>
            <div className={styles.claimField}>
              <Label htmlFor="claim-status">Status</Label>
              <Select
                id="claim-status"
                value={claimForm.status}
                onChange={(e) => setClaimForm({ ...claimForm, status: e.target.value as PersonClaim['status'] })}
              >
                {CLAIM_STATUSES.map((status) => (
                  <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                ))}
              </Select>
            </div>
          </div>

          {/* Only a date claim carries a date, and it is what matches the claim
              to the date it governs on the Overview and the Timeline. */}
          {claimForm.claim_type === 'date' && (
            <div className={styles.claimField}>
              <Label htmlFor="claim-date">Date</Label>
              <Input
                id="claim-date"
                value={claimForm.date_text}
                placeholder="e.g. 20 July 1904"
                onChange={(e) => setClaimForm({ ...claimForm, date_text: e.target.value })}
              />
              <HelperText>What this claim says the date is. Marks the matching date where it is read.</HelperText>
            </div>
          )}

          <div className={styles.claimField}>
            <Label htmlFor="claim-confidence">Confidence</Label>
            <Select
              id="claim-confidence"
              value={claimForm.confidence_level_id}
              onChange={(e) => setClaimForm({ ...claimForm, confidence_level_id: e.target.value })}
            >
              {confidenceLevels.length === 0 ? (
                <option value={claimForm.confidence_level_id}>Unknown</option>
              ) : (
                confidenceLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.numeric_value === null ? level.name : `${level.name} · ${level.numeric_value}`}
                  </option>
                ))
              )}
            </Select>
            <HelperText>How settled the conclusion is. Status above is the state of the records; the two can disagree.</HelperText>
          </div>

          <div className={styles.claimField}>
            <Label htmlFor="claim-section">Linked research section</Label>
            <Select
              id="claim-section"
              value={claimForm.research_section}
              onChange={(e) => setClaimForm({ ...claimForm, research_section: e.target.value })}
            >
              <option value="">— no section (opens the note at the top) —</option>
              {headedSections.map((section) => (
                <option key={section.slug} value={section.slug ?? ''}>
                  {sentenceCase(section.heading!)}
                </option>
              ))}
            </Select>
            <HelperText>
              {headedSections.length === 0
                ? 'This note has no capitalised headings, so there is no section to point at.'
                : 'The passage that argues this claim. Read off the research note\u2019s own headings.'}
            </HelperText>
          </div>

          <div className={styles.claimField}>
            <Label htmlFor="claim-notes">Notes</Label>
            <Textarea
              id="claim-notes"
              rows={3}
              value={claimForm.notes}
              onChange={(e) => setClaimForm({ ...claimForm, notes: e.target.value })}
            />
          </div>

          <div className={styles.claimFormActions}>
            <Button variant="secondary" type="button" onClick={() => setClaimDrawerOpen(false)}>Cancel</Button>
            <Button type="submit" loading={claimSaving}>
              {claimDrawerId ? 'Save Claim' : 'Create Claim'}
            </Button>
          </div>
        </form>
      </ActionDrawer>

      <ActionDrawer
        open={drawerMode !== null}
        title={drawerMode === 'add-story' ? 'Add Story' : 'Connect Artifact'}
        description="This drawer establishes the shared Actions pattern. Searchable pickers will replace raw IDs in the next UI pass."
        onClose={() => setDrawerMode(null)}
      >
        {drawerMode === 'connect-artifact' ? (
          <div className={styles.drawerPlaceholder}>
            <p>Connect an artifact to {displayTitle} using the existing relationship engine.</p>
            <p className={styles.noInfo}>Next step: replace this placeholder with an artifact picker and relationship role selector.</p>
            <Button onClick={() => navigate('/artifacts')}>Browse Artifacts</Button>
          </div>
        ) : (
          <div className={styles.drawerPlaceholder}>
            <p>Preserve a memory, oral history, or explanation connected to {displayTitle}.</p>
            <p className={styles.noInfo}>Next step: launch a story editor with this person preselected as a connected subject.</p>
            <Button onClick={() => navigate('/stories')}>Open Stories</Button>
          </div>
        )}
      </ActionDrawer>

      {/* ── Edit modal ── */}
      <PersonEditModal
        open={showEditModal}
        personId={id ?? null}
        displayName={displayTitle}
        onClose={() => setShowEditModal(false)}
        onSaved={() => {
          fetchPerson();
          fetchRelationships();
          fetchMedia();
          fetchConnectedObjects();
        }}
      />
    </AppShell>
  );
};

export default PersonDetailPage;
