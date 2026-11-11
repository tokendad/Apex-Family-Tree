import fs from 'fs';
import path from 'path';
import { getDatabase } from '../../db/connection.js';
import { createPreImportBackup } from '../backup.js';
import { createLogger } from '../logger.js';
import { recordBulk } from '../audit.js';
import { hasVerifiedCitation, verifyCitations } from './citationVerification.js';
import { IntakeRepository } from '../../repositories/IntakeRepository.js';
import { PersonRepository } from '../../repositories/PersonRepository.js';
import { EventRepository } from '../../repositories/EventRepository.js';
import { FamilyRepository } from '../../repositories/FamilyRepository.js';
import { ClaimRepository } from '../../repositories/ClaimRepository.js';
import { ArtifactRepository } from '../../repositories/ArtifactRepository.js';
import { MediaRepository } from '../../repositories/MediaRepository.js';
import type { Citation, EventProposalPayload, FactProposalPayload, IntakeProposal, PersonProposalPayload, ProposalPayload, RelationshipProposalPayload } from '../../types/intake.js';

const logger = createLogger();

export class IntakeCommitError extends Error {}

function personLabel(payload: PersonProposalPayload): string {
  return [payload.givenName, payload.surname].filter(Boolean).join(' ').trim() || 'Unknown Person';
}

/** Attaches a claim evidencing one or more citable citations against the
 *  intake's source artifact. 'unverified' citations never reach here --
 *  the caller re-verifies against the source text before this is called, so
 *  an edited quote can't introduce something the source doesn't say.
 *  'unconfirmed_image' ones do: there was never a source text to mechanically
 *  check them against, so the reviewer's accept decision is what stands in
 *  for verification -- the citation still gets recorded as evidence, just
 *  noted as unconfirmed.
 *
 * claim_evidence has a UNIQUE(claim_id, evidence_object_id, evidence_role)
 * constraint -- one evidence row per claim per source, which matches the
 * actual shape here (every citation on a proposal points at the same
 * intake source artifact). So this bundles every citable quote into a
 * single addEvidence call rather than one call per citation, which a
 * multi-citation proposal (a person with both a birth and a death quote,
 * say) would otherwise violate on the second call. */
function attachCitationClaim(
  claimRepo: ClaimRepository,
  sourceArtifactId: string,
  subjectObjectId: string,
  claimType: string,
  statement: string,
  citations: Citation[],
  governsObjectId?: string,
): string {
  const claim = claimRepo.create({ statement, claim_type: claimType, subject_object_id: subjectObjectId });
  if (governsObjectId) claimRepo.setGovernedObject(claim.id, governsObjectId);

  const citable = citations.filter((citation) => citation.citationStatus === 'verified' || citation.citationStatus === 'unconfirmed_image');
  if (citable.length > 0) {
    const hasUnconfirmed = citable.some((citation) => citation.citationStatus === 'unconfirmed_image');
    claimRepo.addEvidence(claim.id, {
      evidence_object_id: sourceArtifactId,
      evidence_role: 'supports',
      excerpt: citable.map((citation) => citation.quote).join('\n'),
      locator: citable.find((citation) => citation.locator)?.locator ?? null,
      notes: hasUnconfirmed
        ? 'Transcribed from an image; accepted by reviewer, not mechanically verified against source text.'
        : undefined,
    });
  }
  return claim.id;
}

/** Finds or creates the family union recording A and B as spouses. */
function commitSpouseOf(familyRepo: FamilyRepository, personA: string, personB: string): string {
  const existing = familyRepo.findByPerson(personA).find(
    (family) =>
      (family.spouse1_id === personA && family.spouse2_id === personB)
      || (family.spouse1_id === personB && family.spouse2_id === personA),
  );
  if (existing) return existing.id;
  return familyRepo.create({ spouse1_id: personA, spouse2_id: personB }).id;
}

/** Finds or creates the family union recording parentId as child's parent,
 *  adding child as a member if not already one. Returns null (writing no
 *  conflict itself -- the caller does, since only it has the proposal) when
 *  the parent already has more than one family and the child isn't in any of
 *  them: picking one would be a guess, not a resolution. */
function commitParentChild(familyRepo: FamilyRepository, parentId: string, childId: string): string | null {
  const candidates = familyRepo.findByPerson(parentId);
  const existingWithChild = candidates.find((family) =>
    familyRepo.getMembers(family.id).some((member) => member.person_id === childId));
  if (existingWithChild) return existingWithChild.id;

  if (candidates.length > 1) return null;

  const familyId = candidates[0]?.id ?? familyRepo.create({ spouse1_id: parentId }).id;
  familyRepo.addMember(familyId, childId, 'child');
  return familyId;
}

/** Writes an incoming date onto a person's event if they have none yet;
 *  leaves it alone and reports a conflict if it disagrees with what's
 *  already recorded -- #73's "no conflict smoothing" rule applies to a
 *  reviewed match exactly as it does to a fresh person. */
function reconcileDate(
  eventRepo: EventRepository,
  personId: string,
  eventType: 'birth' | 'death',
  incomingDate: string | null | undefined,
): { conflict: false } | { conflict: true; existing: string; incoming: string } {
  if (!incomingDate) return { conflict: false };

  const existingEvent = eventRepo.findByPerson(personId).find((event) => event.event_type === eventType);
  if (!existingEvent) {
    eventRepo.create({ person_id: personId, event_type: eventType, event_date: incomingDate });
    return { conflict: false };
  }
  if (!existingEvent.event_date) {
    eventRepo.update(existingEvent.id, { event_date: incomingDate });
    return { conflict: false };
  }
  if (existingEvent.event_date === incomingDate) return { conflict: false };
  return { conflict: true, existing: existingEvent.event_date, incoming: incomingDate };
}

export interface CommitResult {
  committed: number;
  conflicts: number;
  /** The committed source artifact's id, so the caller can kick off
   *  thumbnail generation for an uploaded-file source -- that's an async
   *  filesystem+sharp operation that has no place inside the synchronous
   *  better-sqlite3 transaction above. Null when nothing was committed. */
  sourceArtifactId: string | null;
}

/**
 * Commits every accept/edit proposal on an intake item, mirroring gedcom.ts's
 * commit route: pre-commit backup (abort if it fails), one transaction for
 * the whole thing, then a single recordBulk summary afterward. Unlike the
 * GEDCOM path this does not suppress per-record audit entries -- an intake
 * submission is a handful of rows, not thousands, so PersonRepository /
 * EventRepository / FamilyRepository / ClaimRepository's own recordChange()
 * calls are the audit trail, not a bulk log.
 *
 * Commits in three passes so refs resolve in dependency order: person
 * proposals first (so their `ref` exists), then spouse_of relationships (so
 * a parent_of/child_of proposal has a spousal family to attach the child
 * to if the text named both parents), then everything else. A proposal
 * whose ref cannot be resolved -- its person was rejected, or the ref is
 * simply wrong -- is written to intake_conflicts rather than silently
 * skipped or allowed to corrupt a different person's record.
 */
export function commitIntakeItem(intakeItemId: string, userId: string): CommitResult {
  const intakeRepo = new IntakeRepository();
  const item = intakeRepo.findItemById(intakeItemId);
  if (!item) throw new IntakeCommitError('Intake item not found');
  if (item.status !== 'awaiting_review') {
    throw new IntakeCommitError(`Cannot commit an intake item in '${item.status}' status`);
  }

  const proposals = intakeRepo.findProposalsByItem(intakeItemId);
  if (proposals.some((proposal) => !proposal.decision)) {
    throw new IntakeCommitError('All proposals must be accepted, edited, or rejected before commit');
  }

  if (!createPreImportBackup(logger)) {
    throw new IntakeCommitError('Could not create a pre-commit backup; commit aborted');
  }

  const personRepo = new PersonRepository();
  const eventRepo = new EventRepository();
  const familyRepo = new FamilyRepository();
  const claimRepo = new ClaimRepository();
  const artifactRepo = new ArtifactRepository();

  let committed = 0;
  let conflicts = 0;

  const conflict = (proposal: IntakeProposal, fieldName: string, incoming: string | null, existing: string | null = null) => {
    intakeRepo.createConflict({
      intake_item_id: intakeItemId,
      proposal_id: proposal.id,
      record_type: proposal.proposal_type,
      field_name: fieldName,
      existing_value: existing,
      incoming_value: incoming,
    });
    conflicts += 1;
  };

  /** Re-verifies every citation against the source text before it's trusted
   *  for anything -- an `edit` decision can rewrite a quote, and nothing
   *  downstream should take "citationStatus: verified" on faith just because
   *  extraction said so originally. Returns null (and records a conflict)
   *  when nothing in the payload verifies. */
  // A file-based submission has no source text to substring-match a quote
  // against -- its citations stay 'unconfirmed_image', same as extraction.ts
  // marked them originally. Passing '' here instead of null would silently
  // flip every one of them to 'unverified' and fail every image proposal's
  // citation check at commit, which is not what re-verifying is for.
  const sourceTextForVerification = item.source_file_path ? null : item.source_text;

  function verifiedPayload<T extends ProposalPayload & { citations: Citation[] }>(proposal: IntakeProposal, payload: T): T | null {
    const reverified = verifyCitations(payload, sourceTextForVerification);
    if (!hasVerifiedCitation(reverified)) {
      conflict(proposal, 'citations', JSON.stringify(payload.citations));
      return null;
    }
    return reverified;
  }

  // A turn where every proposal was rejected commits nothing, so it gets no
  // source artifact either -- otherwise every all-rejected review leaves a
  // visible, evidence-free "Pasted research text" Document behind.
  const hasNonRejectedProposal = proposals.some((proposal) => proposal.decision !== 'reject');

  let sourceArtifactIdResult: string | null = null;

  const runCommit = getDatabase().transaction(() => {
    // Only ever read below when hasNonRejectedProposal is true (for
    // 'manual') or always (for 'suggested'): every loop that uses it
    // `continue`s past a 'reject' decision first.
    let sourceArtifactId: string | undefined;
    if (item.trigger === 'suggested') {
      // The artifact already existed before this scan found it -- nothing
      // to create, and nothing to delete on an all-rejected review either,
      // since this commit never owned that artifact's existence.
      sourceArtifactId = item.source_artifact_id ?? undefined;
    } else if (hasNonRejectedProposal) {
      const sourceArtifact = artifactRepo.create({
        title: item.source_file_original_name
          ? `Uploaded source — ${item.source_file_original_name}`
          : `Pasted research text — ${item.created_at.slice(0, 10)}`,
        artifact_type_id: 'artifact_type_document',
        transcription: item.source_text || null,
        created_by: userId,
      });
      intakeRepo.setSourceArtifact(intakeItemId, sourceArtifact.id);
      sourceArtifactId = sourceArtifact.id;

      // The staged upload becomes the artifact's file here -- through
      // MediaRepository, not a raw artifact_files insert, so it also gets a
      // media_items row under the same id. Without one, a later manual
      // directory scan (routes/media.ts) would not recognize this file as
      // already belonging to an artifact and would catalogue it a second
      // time as an unrelated new one.
      if (item.source_file_path) {
        const stats = fs.statSync(item.source_file_path);
        new MediaRepository().attachFileToExistingArtifact(sourceArtifactId, {
          filename: path.basename(item.source_file_path),
          original_filename: item.source_file_original_name ?? path.basename(item.source_file_path),
          mime_type: item.source_file_mime_type ?? 'application/octet-stream',
          file_size: stats.size,
          file_path: item.source_file_path,
          uploaded_by: userId,
        });
        // The artifact owns the file from here on; stop tracking it as a
        // staged upload against this intake item.
        intakeRepo.clearSourceFile(intakeItemId);
      }
    }

    const refToPersonId = new Map<string, string>();

    for (const proposal of proposals) {
      if (proposal.proposal_type !== 'person' || proposal.decision === 'reject') continue;
      const payload = verifiedPayload(proposal, (proposal.edited_payload ?? proposal.payload) as PersonProposalPayload);
      if (!payload) continue;

      let personId: string;
      if (payload.existingPersonId) {
        // TOCTOU guard: the matched person a reviewer picked may have been
        // deleted (e.g. by a merge) between staging and commit.
        const existing = personRepo.findById(payload.existingPersonId);
        if (!existing) {
          conflict(proposal, 'existingPersonId', payload.existingPersonId);
          continue;
        }
        personId = payload.existingPersonId;

        const birthResult = reconcileDate(eventRepo, personId, 'birth', payload.birthDate);
        if (birthResult.conflict) conflict(proposal, 'birthDate', birthResult.incoming, birthResult.existing);
        const deathResult = reconcileDate(eventRepo, personId, 'death', payload.deathDate);
        if (deathResult.conflict) conflict(proposal, 'deathDate', deathResult.incoming, deathResult.existing);
      } else {
        const person = personRepo.create({
          created_by: userId,
          display_name: personLabel(payload),
          is_living: payload.deathDate ? 0 : 1,
        });
        personRepo.addName(person.id, { given_name: payload.givenName, surname: payload.surname ?? undefined, is_primary: 1 });
        if (payload.birthDate) eventRepo.create({ person_id: person.id, event_type: 'birth', event_date: payload.birthDate });
        if (payload.deathDate) eventRepo.create({ person_id: person.id, event_type: 'death', event_date: payload.deathDate });
        personId = person.id;
      }

      refToPersonId.set(payload.ref, personId);
      intakeRepo.setCommittedObjectId(proposal.id, personId);
      attachCitationClaim(claimRepo, sourceArtifactId!, personId, 'identity', `${personLabel(payload)} is named in this source.`, payload.citations);
      committed += 1;
    }

    const relationshipRelType = (proposal: IntakeProposal): string =>
      ((proposal.edited_payload ?? proposal.payload) as RelationshipProposalPayload).relType;
    const relationshipProposals = proposals.filter((proposal) => proposal.proposal_type === 'relationship' && proposal.decision !== 'reject');
    const spouseProposals = relationshipProposals.filter((proposal) => relationshipRelType(proposal) === 'spouse_of');
    const otherRelationshipProposals = relationshipProposals.filter((proposal) => relationshipRelType(proposal) !== 'spouse_of');

    const commitRelationship = (proposal: IntakeProposal) => {
      const payload = verifiedPayload(proposal, (proposal.edited_payload ?? proposal.payload) as RelationshipProposalPayload);
      if (!payload) return;

      const personA = refToPersonId.get(payload.personARef);
      const personB = refToPersonId.get(payload.personBRef);
      if (!personA || !personB) {
        conflict(proposal, !personA ? 'personARef' : 'personBRef', !personA ? payload.personARef : payload.personBRef);
        return;
      }

      let familyId: string | null;
      if (payload.relType === 'spouse_of') {
        familyId = commitSpouseOf(familyRepo, personA, personB);
      } else if (payload.relType === 'parent_of') {
        familyId = commitParentChild(familyRepo, personA, personB);
      } else {
        familyId = commitParentChild(familyRepo, personB, personA);
      }

      if (!familyId) {
        conflict(proposal, 'relType', `Ambiguous which of ${payload.relType === 'parent_of' ? personA : personB}'s families to attach the child to`);
        return;
      }

      intakeRepo.setCommittedObjectId(proposal.id, familyId);
      attachCitationClaim(claimRepo, sourceArtifactId!, personA, 'relationship', `${payload.relType.replace('_', ' ')} relationship recorded in this source.`, payload.citations);
      committed += 1;
    };

    for (const proposal of spouseProposals) commitRelationship(proposal);
    for (const proposal of otherRelationshipProposals) commitRelationship(proposal);

    for (const proposal of proposals) {
      if (proposal.proposal_type === 'event' && proposal.decision !== 'reject') {
        const payload = verifiedPayload(proposal, (proposal.edited_payload ?? proposal.payload) as EventProposalPayload);
        if (!payload) continue;

        const personId = refToPersonId.get(payload.personRef);
        if (!personId) {
          conflict(proposal, 'personRef', payload.personRef);
          continue;
        }
        const event = eventRepo.create({
          person_id: personId,
          event_type: payload.eventType,
          event_date: payload.date ?? null,
          event_place: payload.place ?? null,
        });
        intakeRepo.setCommittedObjectId(proposal.id, event.id);
        attachCitationClaim(claimRepo, sourceArtifactId!, personId, 'event', `${payload.eventType} recorded in this source.`, payload.citations, event.id);
        committed += 1;
      }

      if (proposal.proposal_type === 'fact' && proposal.decision !== 'reject') {
        const payload = verifiedPayload(proposal, (proposal.edited_payload ?? proposal.payload) as FactProposalPayload);
        if (!payload) continue;

        const subjectId = refToPersonId.get(payload.subjectRef);
        if (!subjectId) {
          conflict(proposal, 'subjectRef', payload.subjectRef);
          continue;
        }
        const claimId = attachCitationClaim(claimRepo, sourceArtifactId!, subjectId, 'fact', payload.statement, payload.citations);
        intakeRepo.setCommittedObjectId(proposal.id, claimId);
        committed += 1;
      }
    }

    intakeRepo.markCommitted(intakeItemId);
    sourceArtifactIdResult = sourceArtifactId ?? null;
  });

  runCommit();

  // An all-rejected turn creates no artifact (above), so its staged upload
  // -- if any -- would otherwise sit in DATA_DIR/intake-uploads forever with
  // nothing pointing at it. Deleted outside the transaction: filesystem
  // state was never part of what that transaction could roll back anyway.
  if (!hasNonRejectedProposal && item.source_file_path) {
    fs.unlink(item.source_file_path, () => undefined);
    intakeRepo.clearSourceFile(intakeItemId);
  }

  recordBulk('intake', 'intake_commit', intakeItemId, { committed, conflicts });

  return { committed, conflicts, sourceArtifactId: sourceArtifactIdResult };
}
